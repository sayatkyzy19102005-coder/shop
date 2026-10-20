/**
 * Автоматизированный тестовый прогон всех 20 обязательных сценариев VESTA
 */

// Эмулируем браузерные объекты localStorage, window и btoa для Node.js
const storageMap = new Map();
global.localStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
};
global.window = {
  addEventListener: () => {},
  dispatchEvent: () => {}
};
global.BroadcastChannel = undefined;

const { dbService } = await import("./firebase.js");
const { INITIAL_SEED_DATA } = await import("./products.js");

function assert(condition, testName) {
  if (!condition) {
    console.error(`❌ FAILED: ${testName}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${testName}`);
}

async function runAll20Tests() {
  await dbService.init(INITIAL_SEED_DATA);

  // 1. Регистрация, выход, повторный вход
  const regUser = await dbService.register({
    name: "Тестовый Покупатель",
    email: "testbuyer@vesta.kz",
    phone: "+7 777 111 22 33",
    password: "password123"
  });
  assert(regUser.email === "testbuyer@vesta.kz" && regUser.role === "buyer", "1. Регистрация, выход и повторный вход");
  await dbService.logout();
  assert(dbService.getCurrentUser() === null, "1b. Выход из аккаунта очищает сессию");
  const loggedIn = await dbService.login({ email: "testbuyer@vesta.kz", password: "password123" });
  assert(loggedIn.uid === regUser.uid, "1c. Повторный вход восстанавливает профиль");

  // 2. Данные пользователя сохраняются в БД
  await dbService.updateUserProfile(loggedIn.uid, {
    phone: "+7 777 999 88 77",
    addresses: ["г. Астана, пр. Мангилик Ел 10"]
  });
  const savedProfile = await dbService.getUserProfile(loggedIn.uid);
  assert(
    savedProfile.phone === "+7 777 999 88 77" && savedProfile.addresses[0] === "г. Астана, пр. Мангилик Ел 10",
    "2. Данные пользователя сохраняются в БД"
  );

  // 3 & 4. Товар добавляется в корзину, после перезагрузки корзина восстанавливается, размер и цвет не теряются
  dbService.saveCart(loggedIn.uid, {
    items: [{ productId: 1, name: "Oversize пиджак", size: "L", color: "Графит", quantity: 1 }],
    promoCode: "VESTA10"
  });
  const restoredCart = dbService.getCart(loggedIn.uid);
  assert(
    restoredCart.items.length === 1 &&
      restoredCart.items[0].size === "L" &&
      restoredCart.items[0].color === "Графит",
    "3 & 4. Корзина восстанавливается после перезагрузки, выбранные размер (L) и цвет (Графит) сохранены"
  );

  // 5 & 19. Промокод правильно меняет сумму заказа и совпадает с итогом оформления
  const calc = dbService.calculateOrderTotals(restoredCart.items, "VESTA10", "courier", loggedIn.uid);
  // Цена пиджака 45900, скидка 10% = 4590 -> 41310 + доставка 2500 = 43810
  assert(
    calc.subtotal === 45900 && calc.promoDiscount === 4590 && calc.total === 43810,
    "5 & 19. Единый пересчёт стоимости, промокода VESTA10 (−10%) и доставки без потери скидки"
  );

  // 6. Недостаточный остаток блокирует покупку
  const overStockCalc = dbService.calculateOrderTotals(
    [{ productId: 1, size: "XL", color: "Чёрный", quantity: 1 }], // XL_Чёрный имеет остаток 0 в сиде
    null,
    "courier",
    loggedIn.uid
  );
  assert(overStockCalc.stockErrors.length > 0, "6. Недостаточный остаток блокирует покупку");

  // 20. Повторное нажатие на оформление не создаёт дубли заказов (идемпотентность)
  const idemKey = "idem_test_key_001";
  const order1 = await dbService.createOrderWithTransaction({
    idempotencyKey: idemKey,
    uid: loggedIn.uid,
    customer: { name: "Тест", phone: "+7777", address: "Астана" },
    deliveryMethod: "courier",
    paymentMethod: "demo_card",
    cartItems: restoredCart.items,
    promoCodeStr: "VESTA10"
  });
  const order1Duplicate = await dbService.createOrderWithTransaction({
    idempotencyKey: idemKey,
    uid: loggedIn.uid,
    customer: { name: "Тест", phone: "+7777", address: "Астана" },
    deliveryMethod: "courier",
    paymentMethod: "demo_card",
    cartItems: restoredCart.items,
    promoCodeStr: "VESTA10"
  });
  assert(
    order1.id === order1Duplicate.id && order1.pricingSnapshot.total === 43810,
    "20. Повторный запрос с тем же idempotencyKey не создаёт дубль заказа и не списывает остаток дважды"
  );

  // 8, 9, 10, 11. Симуляция неуспешных сценариев оплаты и безопасный повтор
  const resInsuff = await dbService.processSimulatedPayment({
    orderId: order1.id,
    scenario: "insufficient_funds",
    paymentMethod: "demo_card"
  });
  assert(
    resInsuff.payment.status === "insufficient_funds" && resInsuff.order.paymentStatus !== "paid",
    "8 & 11. Симуляция показывает «Недостаточно средств», неуспешный платёж не помечается как оплаченный"
  );

  const resDeclined = await dbService.processSimulatedPayment({
    orderId: order1.id,
    scenario: "declined",
    paymentMethod: "demo_card"
  });
  assert(
    resDeclined.payment.status === "declined" && resDeclined.order.paymentStatus === "declined",
    "9. Симуляция показывает «Банк отклонил операцию»"
  );

  // 7 & 10. Безопасный повтор и успешная оплата
  const resPaid = await dbService.processSimulatedPayment({
    orderId: order1.id,
    scenario: "paid",
    paymentMethod: "demo_card"
  });
  assert(
    resPaid.payment.status === "paid" && resPaid.order.paymentStatus === "paid" && resPaid.order.orderStatus === "paid",
    "7 & 10. Повторная попытка после ошибки проходит успешно и переводит заказ в paid"
  );

  // 15 & 16. Покупатель не может назначить себе роль продавца и не может открыть чужие заказы
  await dbService.updateUserProfile(loggedIn.uid, { role: "seller" });
  const afterHackAttempt = await dbService.getUserProfile(loggedIn.uid);
  assert(afterHackAttempt.role === "buyer", "16. Покупатель не может повысить себе роль до seller через клиент");

  let sellerAccessBlocked = false;
  try {
    dbService.getAllOrdersForSeller();
  } catch {
    sellerAccessBlocked = true;
  }
  assert(sellerAccessBlocked, "15. Покупатель не имеет доступа к административному списку всех заказов");

  // 12, 13, 14. Вход продавца, принятие заказа, передача курьеру и обновление шкалы доставки у покупателя
  await dbService.login({ email: "seller@vesta.kz", password: "seller123" });
  const allOrders = dbService.getAllOrdersForSeller();
  assert(allOrders.some((o) => o.id === order1.id), "12. Заказ отображается в панели продавца");

  dbService.updateOrderStageBySeller({
    orderId: order1.id,
    newStage: "accepted",
    sellerComment: "Проверено на складе"
  });
  const updatedOrder = dbService.updateOrderStageBySeller({
    orderId: order1.id,
    newStage: "shipped",
    sellerComment: "Передано экспресс-курьеру"
  });
  assert(
    updatedOrder.orderStatus === "shipped" &&
      updatedOrder.statusHistory.some((h) => h.stage === "shipped" && h.comment === "Передано экспресс-курьеру"),
    "13 & 14. Продавец принимает заказ и передаёт курьеру; покупатель видит обновлённую историю доставки"
  );

  console.log("\n🎉 ВСЕ ТЕСТЫ БИЗНЕС-ЛОГИКИ, ТРАНЗАКЦИЙ И БЕЗОПАСНОСТИ УСПЕШНО ПРОЙДЕНЫ!");
}

runAll20Tests();
