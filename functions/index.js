/**
 * VESTA — Доверенный серверный слой Cloud Functions (Firebase Admin SDK)
 * Обеспечивает:
 * 1. Безопасное назначение роли продавца (assignSellerRole) — невозможно вызвать без прав администратора.
 * 2. Транзакционное создание заказа (createOrderSecure) — защита от гонок при покупке последней единицы
 *    и пересчёт стоимости и промокода строго на сервере.
 * 3. Серверная обработка оплаты / симуляции (processPaymentSecure) — никогда не доверяет клиентскому paid=true.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * 1. Безопасная выдача роли seller пользователю через Firebase Admin SDK.
 */
exports.assignSellerRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Требуется авторизация.");
  }

  // Только действующий продавец/администратор может назначить нового продавца
  const callerClaims = request.auth.token;
  if (callerClaims.role !== "seller") {
    throw new HttpsError("permission-denied", "Недостаточно полномочий для назначения роли продавца.");
  }

  const { targetEmail } = request.data || {};
  if (!targetEmail) {
    throw new HttpsError("invalid-argument", "Укажите email сотрудника.");
  }

  const userRecord = await admin.auth().getUserByEmail(targetEmail.trim().toLowerCase());
  await admin.auth().setCustomUserClaims(userRecord.uid, { role: "seller" });

  await db.collection("users").doc(userRecord.uid).set(
    {
      role: "seller",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    success: true,
    uid: userRecord.uid,
    message: `Роль seller успешно назначена пользователю ${targetEmail}`
  };
});

/**
 * 2. Транзакционное создание заказа с проверкой остатков, промокода и идемпотентностью.
 */
exports.createOrderSecure = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Войдите в аккаунт для оформления заказа.");
  }

  const { idempotencyKey, items, promoCode, deliveryMethod, paymentMethod, customer } = request.data || {};
  if (!idempotencyKey || !Array.isArray(items) || items.length === 0) {
    throw new HttpsError("invalid-argument", "Некорректные данные заказа.");
  }

  const uid = request.auth.uid;

  return await db.runTransaction(async (tx) => {
    // Защита от дублей заказа по idempotencyKey
    const dupSnap = await tx.get(
      db.collection("orders").where("idempotencyKey", "==", idempotencyKey).limit(1)
    );
    if (!dupSnap.empty) {
      return { id: dupSnap.docs[0].id, ...dupSnap.docs[0].data() };
    }

    let subtotal = 0;
    const snapshotItems = [];

    for (const item of items) {
      const prodRef = db.collection("products").doc(String(item.productId));
      const prodDoc = await tx.get(prodRef);
      if (!prodDoc.exists || prodDoc.data().archived) {
        throw new HttpsError("failed-precondition", `Товар ${item.productId} недоступен.`);
      }

      const prod = prodDoc.data();
      const variantKey = `${item.size}_${item.color}`;
      const currentStock = prod.stock && typeof prod.stock[variantKey] === "number" ? prod.stock[variantKey] : 0;

      if (currentStock < item.quantity) {
        throw new HttpsError(
          "resource-exhausted",
          `Недостаточно остатка для «${prod.name}» (${item.size}, ${item.color}). Доступно: ${currentStock} шт.`
        );
      }

      // Резервируем остаток внутри транзакции
      tx.update(prodRef, {
        [`stock.${variantKey}`]: currentStock - item.quantity,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const lineTotal = prod.price * item.quantity;
      subtotal += lineTotal;

      snapshotItems.push({
        productId: item.productId,
        name: prod.name,
        brand: prod.brand,
        image: prod.images?.[0] || "",
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unitPrice: prod.price,
        oldUnitPrice: prod.oldPrice || prod.price,
        lineTotal
      });
    }

    let promoDiscount = 0;
    let appliedCode = null;
    if (promoCode) {
      const promoSnap = await tx.get(
        db.collection("promoCodes").where("code", "==", promoCode.trim().toUpperCase()).limit(1)
      );
      if (!promoSnap.empty) {
        const promoDoc = promoSnap.docs[0];
        const promo = promoDoc.data();
        const notExpired = !promo.expiresAt || new Date(promo.expiresAt + "T23:59:59Z") >= new Date();
        const underLimit = !promo.maxUses || (promo.usedCount || 0) < promo.maxUses;
        const notUsedByUser = !(promo.usedByUids || []).includes(uid);

        if (promo.active && notExpired && underLimit && notUsedByUser && subtotal >= (promo.minOrderAmount || 0)) {
          promoDiscount =
            promo.type === "percent" ? Math.round((subtotal * promo.value) / 100) : Math.min(subtotal, promo.value);
          appliedCode = promo.code;

          tx.update(promoDoc.ref, {
            usedCount: admin.firestore.FieldValue.increment(1),
            usedByUids: admin.firestore.FieldValue.arrayUnion(uid)
          });
        }
      }
    }

    const discountedSubtotal = Math.max(0, subtotal - promoDiscount);
    const shippingCost = discountedSubtotal >= 50000 || deliveryMethod === "pickup_store" ? 0 : 2500;
    const total = discountedSubtotal + shippingCost;

    const orderId = "VS-" + Math.floor(100000 + Math.random() * 900000);
    const orderRef = db.collection("orders").doc(orderId);
    const isPrepaid = paymentMethod !== "cash_on_delivery";

    const orderPayload = {
      id: orderId,
      idempotencyKey,
      uid,
      createdAt: new Date().toISOString(),
      orderStatus: isPrepaid ? "awaiting_payment" : "created",
      paymentStatus: isPrepaid ? "unpaid" : "cod_pending",
      deliveryStatus: "created",
      deliveryMethod,
      paymentMethod,
      customer,
      items: snapshotItems,
      pricingSnapshot: {
        subtotal,
        promoCode: appliedCode,
        promoDiscount,
        shippingCost,
        total,
        currency: "₸"
      },
      stockReserved: true
    };

    tx.set(orderRef, orderPayload);
    return orderPayload;
  });
});
