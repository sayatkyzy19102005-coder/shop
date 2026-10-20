# VESTA ATELIER — Модернизированный интернет-магазин одежды (HTML / CSS / JS + Firebase)

Полнофункциональный интернет-магазин одежды **VESTA** с двумя раздельными интерфейсами: **витриной покупателя** и **защищённой панелью продавца (`#/seller`)**, симулятором банковского шлюза на 5 сценариев и 12-этапной шкалой доставки.

---

## 📁 Структура проекта

```text
vesta-store/
├── index.html                   # Семантическая разметка витрины покупателя, модальных окон и контейнера /seller
├── styles.css                   # Премиальный монохромный дизайн (Black / White / Graphite), адаптив и Светлая/Тёмная темы
├── app.js                       # Логика покупателя, каталог, корзина с размером/цветом, Checkout и Симулятор оплаты
├── seller.js                    # Защищённый интерфейс продавца (#/seller): KPI, товары, склад, заказы, промокоды, логи
├── firebase.js                  # Шаблон конфигурации Firebase (с заметным TODO) и транзакционный сервис БД
├── products.js                  # Начальный каталог (8 моделей), матрица остатков размер×цвет, образы Lookbook
├── firestore.rules              # Правила безопасности Cloud Firestore (защита ролей, заказов, сумм и остатков)
├── storage.rules                # Правила безопасности Firebase Storage (проверка MIME-типа и размера изображений)
├── firebase.json                # Конфигурация Firebase CLI (Firestore, Storage, Functions, Hosting)
├── test-runner.mjs              # Автотесты всех 20 сценариев бизнес-логики и безопасности
└── functions/
    ├── index.js                 # Cloud Functions (Admin SDK): назначение роли seller и транзакция заказа
    ├── package.json             # Зависимости серверных функций
    └── set-first-seller.js      # CLI-скрипт администратора для безопасного назначения первого продавца
```

---

## 🚀 1. Как запустить проект локально прямо сейчас

Поскольку в проекте используются ES-модули (`<script type="module" src="./app.js">`), запускайте его через любой локальный HTTP-сервер из папки `C:\Users\omirz\.gemini\antigravity\scratch\vesta-store`:

### Вариант А — Через Node.js (`npx serve` или `http-server`)
```powershell
npx serve . -l 3000
```
Откройте в браузере: `http://localhost:3000`

### Вариант Б — Через расширение Live Server в VS Code
1. Откройте папку `C:\Users\omirz\.gemini\antigravity\scratch\vesta-store` как рабочую область (Workspace).
2. Нажмите правой кнопкой мыши на `index.html` → **Open with Live Server**.

### Быстрые демо-аккаунты (для проверки без настройки облака):
* **Покупатель:** `buyer@vesta.kz` / пароль: `buyer123`
* **Продавец (`/seller`):** `seller@vesta.kz` / пароль: `seller123` (или нажмите кнопку быстрого заполнения в окне входа).

---

## ☁️ 2. Пошаговая инструкция по созданию и подключению своего Firebase-проекта

1. Перейдите в [Firebase Console](https://console.firebase.google.com/) и нажмите **Create a project** (Создать проект).
2. На главной странице проекта нажмите иконку **Web (`</>`)**, зарегистрируйте веб-приложение `VESTA Store` и скопируйте объект `firebaseConfig`.
3. Откройте файл [`firebase.js`](./firebase.js) и найдите блок с заметным напоминанием:
   ```javascript
   // TODO: ВСТАВЬТЕ СЮДА КОНФИГУРАЦИЮ СВОЕГО FIREBASE-ПРОЕКТА.
   // Получите её в Firebase Console → Project settings → Your apps → Web app.
   // НЕ ИСПОЛЬЗУЙТЕ КОНФИГУРАЦИЮ ЧУЖОГО ПРОЕКТА.
   const firebaseConfig = {
     apiKey: "ВСТАВЬТЕ_СВОЙ_API_KEY",
     authDomain: "ВСТАВЬТЕ_СВОЙ_AUTH_DOMAIN",
     projectId: "ВСТАВЬТЕ_СВОЙ_PROJECT_ID",
     storageBucket: "ВСТАВЬТЕ_СВОЙ_STORAGE_BUCKET",
     messagingSenderId: "ВСТАВЬТЕ_СВОЙ_MESSAGING_SENDER_ID",
     appId: "ВСТАВЬТЕ_СВОЙ_APP_ID"
   };
   ```
4. Замените заглушки `ВСТАВЬТЕ_СВОЙ_...` на значения вашего проекта. Верхний индикатор в шапке сайта автоматически переключится с `⚠️ Демо-база` на `☁️ Firebase Cloud подключён`.

---

## 🔐 3. Включение Authentication, Cloud Firestore и Storage

1. **Authentication:**
   * В меню Firebase Console выберите **Build → Authentication → Get started**.
   * На вкладке **Sign-in method** включите провайдер **Email/Password**.
2. **Cloud Firestore:**
   * Перейдите в **Build → Firestore Database → Create database**.
   * Выберите режим **Production mode** и ближайший регион (например, `eur3`).
3. **Firebase Storage:**
   * Перейдите в **Build → Storage → Get started** для хранения фотографий товаров.
4. **Деплой правил безопасности и Cloud Functions:**
   ```powershell
   npm install -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules,storage,functions
   ```

---

## 🛡 4. Инструкция по безопасному созданию первого продавца (`seller`)

Покупатель **не может** назначить себе роль `seller` через браузерную консоль или правку `users/{uid}` (это заблокировано и в коде [`firebase.js`](./firebase.js), и в [`firestore.rules`](./firestore.rules)).

Чтобы назначить первого продавца:
1. Зарегистрируйте обычный аккаунт сотрудника на сайте (например, `admin@vesta.kz`).
2. В Firebase Console перейдите в **Project settings → Service accounts** и нажмите **Generate new private key**. Сохраните файл как `serviceAccountKey.json` (вне публичной папки сайта!).
3. Выполните локальный административный скрипт:
   ```powershell
   cd functions
   npm install
   node set-first-seller.js admin@vesta.kz ./serviceAccountKey.json
   ```
4. После этого войдите под этим аккаунтом на сайте и откройте панель `#/seller`. Назначать следующих продавцов можно через защищённую Cloud Function `assignSellerRole`.
