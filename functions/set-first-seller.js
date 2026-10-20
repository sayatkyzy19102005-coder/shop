/**
 * Скрипт назначения первого продавца (seller) через Firebase Admin SDK.
 * Запускается локально администратором проекта (НЕ в браузере!):
 *
 * Использование:
 *   node functions/set-first-seller.js seller@yourdomain.kz ./serviceAccountKey.json
 */

const admin = require("firebase-admin");
const path = require("path");

const targetEmail = process.argv[2];
const keyPath = process.argv[3];

if (!targetEmail || !keyPath) {
  console.error("Использование: node functions/set-first-seller.js <email> <путь_к_serviceAccountKey.json>");
  process.exit(1);
}

const serviceAccount = require(path.resolve(keyPath));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function grantSellerRole() {
  try {
    const user = await admin.auth().getUserByEmail(targetEmail.trim().toLowerCase());
    await admin.auth().setCustomUserClaims(user.uid, { role: "seller" });
    await admin.firestore().collection("users").doc(user.uid).set(
      {
        uid: user.uid,
        email: user.email,
        role: "seller",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    console.log(`✅ Пользователю ${targetEmail} (UID: ${user.uid}) успешно назначена роль seller!`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Ошибка назначения роли:", err.message);
    process.exit(1);
  }
}

grantSellerRole();
