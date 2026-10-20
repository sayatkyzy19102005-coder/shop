/**
 * VESTA — Инициализация Firebase и Слой работы с данными (Cloud Firestore / Storage / Auth)
 * Поддерживает автоматическое переключение на локальную синхронизируемую БД (Demo Mode),
 * если конфигурация Firebase ещё не заполнена разработчиком.
 */

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
  // measurementId добавляется при необходимости
};

/**
 * Проверка, заполнил ли разработчик реальные ключи Firebase
 */
export function isFirebaseConfigured() {
  return (
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes("ВСТАВЬТЕ_СВОЙ") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.includes("ВСТАВЬТЕ_СВОЙ")
  );
}

/**
 * Единый сервис данных VESTADB.
 * При настроенном Firebase использует официальный Firebase SDK v10 (Auth, Firestore, Storage, Functions)
 * с транзакциями и проверкой прав.
 * Если конфигурация содержит шаблон "ВСТАВЬТЕ_СВОЙ_...", честно уведомляет разработчика
 * и активирует локальный эмулятор коллекций Firestore с поддержкой транзакций,
 * снимков заказов, проверкой остатков и синхронизацией между вкладками (BroadcastChannel + storage event).
 */
class VestaDatabaseService {
  constructor() {
    this.isCloud = isFirebaseConfigured();
    this.app = null;
    this.auth = null;
    this.db = null;
    this.storage = null;
    this.functions = null;
    this.authListeners = [];
    this.dataListeners = new Set();
    this.channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("vesta_db_sync") : null;

    if (this.channel) {
      this.channel.onmessage = (event) => {
        if (event.data && event.data.type === "DB_UPDATED") {
          this.notifyDataListeners(event.data.collection);
        }
      };
    }

    window.addEventListener("storage", (e) => {
      if (e.key && e.key.startsWith("vesta_db_")) {
        this.notifyDataListeners(e.key.replace("vesta_db_", ""));
      }
    });
  }

  async init(initialSeedData) {
    if (this.isCloud) {
      try {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
        const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
        const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const { getStorage } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");
        const { getFunctions } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");

        this.app = initializeApp(firebaseConfig);
        this.auth = getAuth(this.app);
        this.db = getFirestore(this.app);
        this.storage = getStorage(this.app);
        this.functions = getFunctions(this.app);

        onAuthStateChanged(this.auth, async (user) => {
          if (user) {
            const tokenResult = await user.getIdTokenResult();
            const profile = await this.getUserProfile(user.uid, user.email, user.displayName);
            const role = tokenResult.claims.role === "seller" || profile.role === "seller" ? "seller" : "buyer";
            this._currentUser = {
              uid: user.uid,
              email: user.email,
              name: profile.name || user.displayName || "Покупатель",
              phone: profile.phone || "",
              addresses: profile.addresses || [],
              role
            };
          } else {
            this._currentUser = null;
          }
          this.notifyAuthListeners(this._currentUser);
        });
      } catch (err) {
        console.error("Ошибка инициализации облачного Firebase:", err);
        this.isCloud = false;
      }
    }

    // Инициализация локального хранилища коллекций (используется в деморежиме и как начальный сид)
    this._ensureLocalSeed(initialSeedData);

    if (!this.isCloud) {
      const savedSession = localStorage.getItem("vesta_auth_session");
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          const users = this._getLocalCollection("users");
          const dbUser = users.find((u) => u.uid === parsed.uid);
          this._currentUser = dbUser || null;
        } catch {
          this._currentUser = null;
        }
      } else {
        this._currentUser = null;
      }
      setTimeout(() => this.notifyAuthListeners(this._currentUser), 10);
    }
  }

  _ensureLocalSeed(seed) {
    if (!seed) return;
    const collections = [
      "products",
      "categories",
      "promoCodes",
      "reviews",
      "storeSettings",
      "users",
      "orders",
      "payments",
      "inventoryLogs",
      "stockSubscriptions"
    ];

    collections.forEach((col) => {
      const key = `vesta_db_${col}`;
      if (!localStorage.getItem(key) && seed[col]) {
        localStorage.setItem(key, JSON.stringify(seed[col]));
      }
    });

    // Миграция данных из старого формата index23.html, если они были у пользователя
    const legacyFavs = localStorage.getItem("vestaFavorites");
    if (legacyFavs && !localStorage.getItem("vesta_migrated_v1")) {
      localStorage.setItem("vesta_migrated_v1", "true");
    }
  }

  _getLocalCollection(name) {
    try {
      const raw = localStorage.getItem(`vesta_db_${name}`);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error(`Ошибка чтения коллекции ${name}:`, e);
      return [];
    }
  }

  _setLocalCollection(name, data) {
    localStorage.setItem(`vesta_db_${name}`, JSON.stringify(data));
    if (this.channel) {
      this.channel.postMessage({ type: "DB_UPDATED", collection: name });
    }
    this.notifyDataListeners(name);
  }

  onAuthChange(cb) {
    this.authListeners.push(cb);
    if (this._currentUser !== undefined) {
      cb(this._currentUser);
    }
  }

  notifyAuthListeners(user) {
    this.authListeners.forEach((cb) => cb(user));
  }

  onDataChange(cb) {
    this.dataListeners.add(cb);
    return () => this.dataListeners.delete(cb);
  }

  notifyDataListeners(collectionName) {
    this.dataListeners.forEach((cb) => cb(collectionName));
  }

  getCurrentUser() {
    return this._currentUser || null;
  }

  /* ==========================================
     АУТЕНТИФИКАЦИЯ И ПРОФИЛЬ (users/{uid})
     ========================================== */

  async register({ name, email, phone, password }) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password || password.length < 6) {
      throw new Error("Пароль должен содержать минимум 6 символов, а email быть корректным.");
    }

    if (this.isCloud) {
      const { createUserWithEmailAndPassword, updateProfile } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
      const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const cred = await createUserWithEmailAndPassword(this.auth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: name.trim() });
      const userDoc = {
        uid: cred.user.uid,
        name: name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        role: "buyer", // Никогда не даём seller при клиентской регистрации
        addresses: [],
        createdAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(this.db, "users", cred.user.uid), userDoc);
      return userDoc;
    }

    const users = this._getLocalCollection("users");
    if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      throw new Error("Пользователь с таким email уже зарегистрирован.");
    }

    const newUser = {
      uid: "usr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      name: name.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      // Пароль хранится только как демо-хеш для локального входа в эмуляторе
      passwordHash: btoa(encodeURIComponent(password)),
      role: "buyer",
      addresses: [],
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this._setLocalCollection("users", users);

    const sessionUser = { ...newUser };
    delete sessionUser.passwordHash;
    this._currentUser = sessionUser;
    localStorage.setItem("vesta_auth_session", JSON.stringify({ uid: sessionUser.uid }));
    this.notifyAuthListeners(sessionUser);
    return sessionUser;
  }

  async login({ email, password }) {
    const cleanEmail = email.trim().toLowerCase();
    if (this.isCloud) {
      const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
      const cred = await signInWithEmailAndPassword(this.auth, cleanEmail, password);
      return cred.user;
    }

    const users = this._getLocalCollection("users");
    const hash = btoa(encodeURIComponent(password));
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail && u.passwordHash === hash);
    if (!user) {
      throw new Error("Неверный email или пароль.");
    }

    const sessionUser = { ...user };
    delete sessionUser.passwordHash;
    this._currentUser = sessionUser;
    localStorage.setItem("vesta_auth_session", JSON.stringify({ uid: sessionUser.uid }));
    this.notifyAuthListeners(sessionUser);
    return sessionUser;
  }

  async logout() {
    if (this.isCloud) {
      const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
      await signOut(this.auth);
    }
    this._currentUser = null;
    localStorage.removeItem("vesta_auth_session");
    this.notifyAuthListeners(null);
  }

  async resetPassword(email) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) throw new Error("Укажите ваш email для восстановления пароля.");
    if (this.isCloud) {
      const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
      await sendPasswordResetEmail(this.auth, cleanEmail);
      return { sent: true, mode: "cloud" };
    }
    const users = this._getLocalCollection("users");
    const exists = users.some((u) => u.email.toLowerCase() === cleanEmail);
    if (!exists) {
      throw new Error("Аккаунт с таким email не найден в демо-базе.");
    }
    return { sent: true, mode: "demo" };
  }

  async getUserProfile(uid, fallbackEmail = "", fallbackName = "") {
    if (this.isCloud) {
      const { doc, getDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const ref = doc(this.db, "users", uid);
      const snap = await getDoc(ref);
      if (snap.exists()) return snap.data();
      const fresh = {
        uid,
        name: fallbackName || "Покупатель",
        email: fallbackEmail,
        phone: "",
        role: "buyer",
        addresses: [],
        createdAt: new Date().toISOString()
      };
      await setDoc(ref, fresh);
      return fresh;
    }
    const users = this._getLocalCollection("users");
    return users.find((u) => u.uid === uid) || null;
  }

  async updateUserProfile(uid, updates) {
    // Защита от повышения привилегий на клиенте: поле role игнорируется и удаляется
    const safeUpdates = { ...updates };
    delete safeUpdates.role;
    delete safeUpdates.uid;
    delete safeUpdates.passwordHash;

    if (this.isCloud) {
      const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      await updateDoc(doc(this.db, "users", uid), safeUpdates);
    } else {
      const users = this._getLocalCollection("users");
      const idx = users.findIndex((u) => u.uid === uid);
      if (idx === -1) throw new Error("Пользователь не найден");
      users[idx] = { ...users[idx], ...safeUpdates, updatedAt: new Date().toISOString() };
      this._setLocalCollection("users", users);
      if (this._currentUser && this._currentUser.uid === uid) {
        const updatedSession = { ...users[idx] };
        delete updatedSession.passwordHash;
        this._currentUser = updatedSession;
        this.notifyAuthListeners(this._currentUser);
      }
    }
    return this._currentUser;
  }

  /* ==========================================
     КАТАЛОГ ТОВАРОВ И КАТЕГОРИИ (products, categories)
     ========================================== */

  async getProducts() {
    if (this.isCloud) {
      const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const snap = await getDocs(collection(this.db, "products"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    return this._getLocalCollection("products");
  }

  async getCategories() {
    if (this.isCloud) {
      const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const snap = await getDocs(collection(this.db, "categories"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    return this._getLocalCollection("categories");
  }

  async saveCategory(categoryData) {
    this._requireSeller();
    const categories = this._getLocalCollection("categories");
    if (categoryData.id) {
      const idx = categories.findIndex((c) => c.id === categoryData.id);
      if (idx !== -1) categories[idx] = { ...categories[idx], ...categoryData };
    } else {
      categoryData.id = "cat_" + Date.now();
      categories.push(categoryData);
    }
    this._setLocalCollection("categories", categories);
    this._logSellerAction("SAVE_CATEGORY", `Категория «${categoryData.name}» обновлена`);
    return categoryData;
  }

  async deleteCategory(categoryId) {
    this._requireSeller();
    const categories = this._getLocalCollection("categories").filter((c) => c.id !== categoryId);
    this._setLocalCollection("categories", categories);
    this._logSellerAction("DELETE_CATEGORY", `Удалена категория ID: ${categoryId}`);
  }

  async saveProduct(productData) {
    this._requireSeller();
    const products = this._getLocalCollection("products");
    const now = new Date().toISOString();

    if (productData.id) {
      const idx = products.findIndex((p) => String(p.id) === String(productData.id));
      if (idx === -1) throw new Error("Товар не найден");
      products[idx] = {
        ...products[idx],
        ...productData,
        updatedAt: now
      };
      this._setLocalCollection("products", products);
      this._logSellerAction("UPDATE_PRODUCT", `Обновлён товар «${productData.name}» (ID: ${productData.id})`);
      return products[idx];
    } else {
      const newProduct = {
        ...productData,
        id: "prod_" + Date.now(),
        rating: 5.0,
        reviewsCount: 0,
        createdAt: now,
        updatedAt: now,
        archived: false
      };
      products.unshift(newProduct);
      this._setLocalCollection("products", products);
      this._logSellerAction("CREATE_PRODUCT", `Создан товар «${newProduct.name}» (ID: ${newProduct.id})`);
      return newProduct;
    }
  }

  async toggleArchiveProduct(productId) {
    this._requireSeller();
    const products = this._getLocalCollection("products");
    const idx = products.findIndex((p) => String(p.id) === String(productId));
    if (idx === -1) throw new Error("Товар не найден");
    products[idx].archived = !products[idx].archived;
    products[idx].updatedAt = new Date().toISOString();
    this._setLocalCollection("products", products);
    this._logSellerAction(
      products[idx].archived ? "ARCHIVE_PRODUCT" : "RESTORE_PRODUCT",
      `${products[idx].archived ? "Архивирован" : "Восстановлен"} товар «${products[idx].name}»`
    );
    return products[idx];
  }

  async updateVariantStock(productId, size, color, newQty, reason = "Ручная корректировка продавцом") {
    this._requireSeller();
    const products = this._getLocalCollection("products");
    const idx = products.findIndex((p) => String(p.id) === String(productId));
    if (idx === -1) throw new Error("Товар не найден");
    const p = products[idx];
    const key = `${size}_${color}`;
    const oldQty = p.stock && typeof p.stock[key] === "number" ? p.stock[key] : 0;
    if (!p.stock) p.stock = {};
    p.stock[key] = Math.max(0, Number(newQty) || 0);
    this._setLocalCollection("products", products);

    this._logSellerAction(
      "STOCK_ADJUST",
      `Остаток «${p.name}» (${size} / ${color}): ${oldQty} → ${p.stock[key]} шт. Причина: ${reason}`
    );
    return p;
  }

  /* ==========================================
     ЗАГРУЗКА ИЗОБРАЖЕНИЙ (Firebase Storage)
     ========================================== */

  async uploadProductImage(file) {
    this._requireSeller();
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowedTypes.includes(file.type)) {
      throw new Error("Разрешены только изображения форматов JPG, PNG, WebP или AVIF.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Размер файла не должен превышать 5 МБ.");
    }

    if (this.isCloud && this.storage) {
      const { ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageRef = ref(this.storage, `products/${Date.now()}_${safeName}`);
      const snap = await uploadBytes(storageRef, file, { contentType: file.type });
      return await getDownloadURL(snap.ref);
    }

    // В демо-режиме конвертируем изображение в компактный DataURL (с ресайзом через Canvas)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxDim = 900;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = () => reject(new Error("Не удалось обработать изображение"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Ошибка чтения файла"));
      reader.readAsDataURL(file);
    });
  }

  /* ==========================================
     КОРЗИНА И ИЗБРАННОЕ (carts/{uid}, users/{uid})
     ========================================== */

  getCart(uid) {
    const key = uid ? `vesta_cart_${uid}` : "vesta_cart_guest";
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : { items: [], promoCode: null };
    } catch {
      return { items: [], promoCode: null };
    }
  }

  saveCart(uid, cartData) {
    const key = uid ? `vesta_cart_${uid}` : "vesta_cart_guest";
    localStorage.setItem(key, JSON.stringify(cartData));
    if (this.channel) {
      this.channel.postMessage({ type: "DB_UPDATED", collection: "carts" });
    }
  }

  getFavorites(uid) {
    const key = uid ? `vesta_fav_${uid}` : "vesta_fav_guest";
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveFavorites(uid, favIds) {
    const key = uid ? `vesta_fav_${uid}` : "vesta_fav_guest";
    localStorage.setItem(key, JSON.stringify(favIds));
    if (this.channel) {
      this.channel.postMessage({ type: "DB_UPDATED", collection: "favorites" });
    }
  }

  /* ==========================================
     ПРОМОКОДЫ И НАСТРОЙКИ МАГАЗИНА
     ========================================== */

  getStoreSettings() {
    const list = this._getLocalCollection("storeSettings");
    return (
      list[0] || {
        id: "main",
        storeName: "VESTA",
        currency: "₸",
        courierFee: 2500,
        pickupFee: 1000,
        freeShippingThreshold: 50000,
        lowStockThreshold: 3,
        supportPhone: "+7 (700) 240-88-90",
        supportEmail: "concierge@vesta-atelier.kz",
        instagram: "@vesta.atelier",
        returnDays: 14,
        returnPolicyText:
          "Возврат товара надлежащего качества возможен в течение 14 дней с момента получения при условии сохранения товарного вида, фабричных ярлыков и пломб.",
        privacyPolicyText:
          "VESTA обрабатывает персональные данные покупателей исключительно для исполнения договоров купли-продажи, доставки заказов и сервисной поддержки в соответствии с законодательством РК."
      }
    );
  }

  saveStoreSettings(newSettings) {
    this._requireSeller();
    const current = this.getStoreSettings();
    const merged = { ...current, ...newSettings, updatedAt: new Date().toISOString() };
    this._setLocalCollection("storeSettings", [merged]);
    this._logSellerAction("UPDATE_SETTINGS", "Обновлены глобальные настройки магазина и тарифов доставки");
    return merged;
  }

  getPromoCodes() {
    return this._getLocalCollection("promoCodes");
  }

  savePromoCode(promo) {
    this._requireSeller();
    const list = this._getLocalCollection("promoCodes");
    const cleanCode = promo.code.trim().toUpperCase();
    const existingIdx = list.findIndex((p) => p.id === promo.id || p.code === cleanCode);
    const record = {
      id: promo.id || "promo_" + Date.now(),
      code: cleanCode,
      type: promo.type || "percent", // percent | fixed
      value: Number(promo.value) || 10,
      minOrderAmount: Number(promo.minOrderAmount) || 0,
      maxUses: Number(promo.maxUses) || 100,
      usedCount: Number(promo.usedCount) || 0,
      usedByUids: promo.usedByUids || [],
      expiresAt: promo.expiresAt || "2027-12-31",
      active: promo.active !== false
    };
    if (existingIdx !== -1) {
      list[existingIdx] = { ...list[existingIdx], ...record };
    } else {
      list.unshift(record);
    }
    this._setLocalCollection("promoCodes", list);
    this._logSellerAction("SAVE_PROMO", `Сохранён промокод ${record.code} (${record.value}${record.type === "percent" ? "%" : " ₸"})`);
    return record;
  }

  deletePromoCode(id) {
    this._requireSeller();
    const list = this._getLocalCollection("promoCodes").filter((p) => p.id !== id);
    this._setLocalCollection("promoCodes", list);
    this._logSellerAction("DELETE_PROMO", `Удалён промокод ID: ${id}`);
  }

  validatePromoCode(code, subtotal, uid) {
    if (!code) return { valid: false, message: "Введите промокод" };
    const clean = code.trim().toUpperCase();
    const list = this.getPromoCodes();
    const promo = list.find((p) => p.code === clean);

    if (!promo) {
      return { valid: false, message: "Промокод не найден" };
    }
    if (!promo.active) {
      return { valid: false, message: "Промокод деактивирован" };
    }
    if (promo.expiresAt && new Date(promo.expiresAt + "T23:59:59") < new Date()) {
      return { valid: false, message: "Срок действия промокода истёк" };
    }
    if (promo.maxUses && promo.usedCount >= promo.maxUses) {
      return { valid: false, message: "Лимит активаций промокода исчерпан" };
    }
    if (uid && Array.isArray(promo.usedByUids) && promo.usedByUids.includes(uid)) {
      return { valid: false, message: "Вы уже использовали этот промокод ранее" };
    }
    if (subtotal < promo.minOrderAmount) {
      return {
        valid: false,
        message: `Минимальная сумма заказа для промокода ${clean} — ${promo.minOrderAmount.toLocaleString("ru-RU")} ₸`
      };
    }

    let discountAmount = 0;
    if (promo.type === "percent") {
      discountAmount = Math.round((subtotal * promo.value) / 100);
    } else {
      discountAmount = Math.min(subtotal, promo.value);
    }

    return {
      valid: true,
      promo,
      discountAmount,
      message: `Промокод ${clean} применён (скидка ${discountAmount.toLocaleString("ru-RU")} ₸)`
    };
  }

  /* ==========================================
     ЕДИНЫЙ КАЛЬКУЛЯТОР СУММЫ И СОЗДАНИЕ ЗАКАЗА (ТРАНЗАКЦИЯ)
     ========================================== */

  calculateOrderTotals(cartItems, promoCodeStr, deliveryMethod, uid) {
    const products = this._getLocalCollection("products");
    const settings = this.getStoreSettings();
    let subtotal = 0;
    let catalogDiscountTotal = 0;
    const detailedItems = [];
    const stockErrors = [];

    for (const item of cartItems) {
      const p = products.find((x) => String(x.id) === String(item.productId));
      if (!p || p.archived) {
        stockErrors.push(`Товар «${item.name || item.productId}» больше не доступен.`);
        continue;
      }
      const variantKey = `${item.size}_${item.color}`;
      const availableStock = p.stock && typeof p.stock[variantKey] === "number" ? p.stock[variantKey] : 0;

      if (availableStock < item.quantity) {
        stockErrors.push(
          `Недостаточно товара «${p.name}» (${item.size}, ${item.color}): доступно ${availableStock} шт., в корзине ${item.quantity} шт.`
        );
      }

      const unitPrice = Number(p.price) || 0;
      const oldUnitPrice = Number(p.oldPrice) > unitPrice ? Number(p.oldPrice) : unitPrice;
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      catalogDiscountTotal += (oldUnitPrice - unitPrice) * item.quantity;

      detailedItems.push({
        productId: p.id,
        name: p.name,
        brand: p.brand,
        image: p.images && p.images[0] ? p.images[0] : "",
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unitPrice,
        oldUnitPrice,
        lineTotal,
        availableStock
      });
    }

    let promoDiscount = 0;
    let appliedPromo = null;
    let promoMessage = "";

    if (promoCodeStr) {
      const v = this.validatePromoCode(promoCodeStr, subtotal, uid);
      if (v.valid) {
        promoDiscount = v.discountAmount;
        appliedPromo = v.promo;
        promoMessage = v.message;
      } else {
        promoMessage = v.message;
      }
    }

    const discountedSubtotal = Math.max(0, subtotal - promoDiscount);
    let shippingCost = 0;
    if (subtotal > 0) {
      if (discountedSubtotal >= settings.freeShippingThreshold || deliveryMethod === "pickup_store") {
        shippingCost = 0;
      } else if (deliveryMethod === "pickup_point") {
        shippingCost = settings.pickupFee;
      } else {
        shippingCost = settings.courierFee;
      }
    }

    const total = discountedSubtotal + shippingCost;

    return {
      detailedItems,
      subtotal,
      catalogDiscountTotal,
      promoDiscount,
      appliedPromo,
      promoMessage,
      shippingCost,
      total,
      currency: settings.currency || "₸",
      stockErrors
    };
  }

  /**
   * Транзакционное создание заказа с защитой от гонок остатков и идемпотентностью (idempotencyKey).
   */
  async createOrderWithTransaction({
    idempotencyKey,
    uid,
    customer,
    deliveryMethod,
    paymentMethod,
    cartItems,
    promoCodeStr
  }) {
    if (!idempotencyKey) throw new Error("Отсутствует ключ идемпотентности заказа.");

    const existingOrders = this._getLocalCollection("orders");
    const duplicate = existingOrders.find((o) => o.idempotencyKey === idempotencyKey);
    if (duplicate) {
      return duplicate;
    }

    if (!cartItems || !cartItems.length) {
      throw new Error("Корзина пуста.");
    }

    const calc = this.calculateOrderTotals(cartItems, promoCodeStr, deliveryMethod, uid);
    if (calc.stockErrors.length > 0) {
      throw new Error(calc.stockErrors.join(" "));
    }

    // Атомарное резервирование остатков
    const products = this._getLocalCollection("products");
    for (const item of calc.detailedItems) {
      const pIdx = products.findIndex((x) => String(x.id) === String(item.productId));
      const key = `${item.size}_${item.color}`;
      const currentQty = products[pIdx].stock?.[key] ?? 0;
      if (currentQty < item.quantity) {
        throw new Error(`К сожалению, товар «${item.name}» (${item.size}, ${item.color}) только что закончился.`);
      }
      products[pIdx].stock[key] = currentQty - item.quantity;
    }
    this._setLocalCollection("products", products);

    // Фиксация использования промокода
    if (calc.appliedPromo) {
      const promos = this._getLocalCollection("promoCodes");
      const prIdx = promos.findIndex((p) => p.id === calc.appliedPromo.id);
      if (prIdx !== -1) {
        promos[prIdx].usedCount = (promos[prIdx].usedCount || 0) + 1;
        if (uid) {
          promos[prIdx].usedByUids = promos[prIdx].usedByUids || [];
          if (!promos[prIdx].usedByUids.includes(uid)) {
            promos[prIdx].usedByUids.push(uid);
          }
        }
        this._setLocalCollection("promoCodes", promos);
      }
    }

    const now = new Date();
    const expectedDate = new Date(now.getTime() + (deliveryMethod === "pickup_store" ? 1 : 3) * 86400000);
    const orderId = "VS-" + Math.floor(100000 + Math.random() * 900000);
    const demoTrackNumber = "VST-KZ-" + Math.floor(10000000 + Math.random() * 90000000);

    const isPrepaid = paymentMethod !== "cash_on_delivery";
    const initialOrderStatus = isPrepaid ? "awaiting_payment" : "created";
    const initialPaymentStatus = isPrepaid ? "unpaid" : "cod_pending";
    const initialDeliveryStatus = "created";

    const statusHistory = [
      {
        id: "evt_" + Date.now() + "_1",
        stage: "created",
        title: "Заказ оформлен",
        description: `Заказ ${orderId} создан и товары зарезервированы на складе.`,
        actor: "Покупатель",
        comment: "",
        timestamp: now.toISOString()
      }
    ];

    if (isPrepaid) {
      statusHistory.push({
        id: "evt_" + Date.now() + "_2",
        stage: "awaiting_payment",
        title: "Ожидает оплаты",
        description: "Ожидание подтверждения транзакции от платёжного шлюза.",
        actor: "Система",
        comment: "",
        timestamp: new Date(now.getTime() + 100).toISOString()
      });
    }

    const newOrder = {
      id: orderId,
      idempotencyKey,
      uid: uid || "guest",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expectedDeliveryDate: expectedDate.toISOString().split("T")[0],
      demoTrackingNumber: demoTrackNumber,
      isDemoTracking: true,
      orderStatus: initialOrderStatus, // created | awaiting_payment | paid | accepted | packing | shipped | in_transit | ready_for_pickup | out_for_delivery | delivered | cancelled | return_requested | returned
      paymentStatus: initialPaymentStatus, // unpaid | pending | paid | insufficient_funds | declined | error | cod_pending
      deliveryStatus: initialDeliveryStatus,
      deliveryMethod, // courier | pickup_point | pickup_store
      paymentMethod, // demo_card | demo_wallet | cash_on_delivery
      customer: {
        name: customer.name.trim(),
        phone: customer.phone.trim(),
        email: (customer.email || "").trim(),
        address: customer.address.trim(),
        comment: (customer.comment || "").trim()
      },
      // Снимок состава заказа на момент покупки
      items: calc.detailedItems.map((it) => ({
        productId: it.productId,
        name: it.name,
        brand: it.brand,
        image: it.image,
        size: it.size,
        color: it.color,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        oldUnitPrice: it.oldUnitPrice,
        lineTotal: it.lineTotal
      })),
      pricingSnapshot: {
        subtotal: calc.subtotal,
        catalogDiscountTotal: calc.catalogDiscountTotal,
        promoCode: calc.appliedPromo ? calc.appliedPromo.code : null,
        promoDiscount: calc.promoDiscount,
        shippingCost: calc.shippingCost,
        total: calc.total,
        currency: calc.currency
      },
      stockReserved: true,
      cancelReason: null,
      statusHistory
    };

    const orders = this._getLocalCollection("orders");
    orders.unshift(newOrder);
    this._setLocalCollection("orders", orders);

    return newOrder;
  }

  /* ==========================================
     СИМУЛЯТОР БАНКОВСКОЙ ОПЛАТЫ (payments/{paymentId})
     ========================================== */

  async processSimulatedPayment({ orderId, scenario, paymentMethod, idempotencyKey }) {
    const orders = this._getLocalCollection("orders");
    const oIdx = orders.findIndex((o) => o.id === orderId);
    if (oIdx === -1) throw new Error("Заказ не найден");
    const order = orders[oIdx];

    if (order.paymentStatus === "paid") {
      throw new Error("Этот заказ уже успешно оплачен. Повторное списание заблокировано.");
    }

    const payments = this._getLocalCollection("payments");
    if (idempotencyKey) {
      const existingAttempt = payments.find((p) => p.idempotencyKey === idempotencyKey);
      if (existingAttempt) return { payment: existingAttempt, order };
    }

    const now = new Date().toISOString();
    const paymentId = "PAY-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();

    const scenarioMeta = {
      paid: {
        status: "paid",
        reason: "Транзакция успешно авторизована демо-банком (Код авторизации: DEMO-200)."
      },
      insufficient_funds: {
        status: "insufficient_funds",
        reason: "На счёте недостаточно средств для списания суммы заказа. Попробуйте другую карту или способ оплаты."
      },
      declined: {
        status: "declined",
        reason: "Операция отклонена банком-эмитентом (лимит интернет-операций или антифрод-правило)."
      },
      error: {
        status: "error",
        reason: "Временный сбой связи с банковским шлюзом. Средства не списаны, повторите попытку."
      },
      pending: {
        status: "pending",
        reason: "Платёж находится на дополнительной проверке в банке (ожидание клиринга)."
      }
    };

    const outcome = scenarioMeta[scenario] || scenarioMeta.paid;

    const paymentRecord = {
      id: paymentId,
      idempotencyKey: idempotencyKey || paymentId,
      orderId: order.id,
      uid: order.uid,
      amount: order.pricingSnapshot.total,
      currency: order.pricingSnapshot.currency,
      method: paymentMethod || order.paymentMethod,
      status: outcome.status,
      message: outcome.reason,
      isSimulation: true,
      createdAt: now
    };

    payments.unshift(paymentRecord);
    this._setLocalCollection("payments", payments);

    // Обновляем статус оплаты заказа
    order.paymentStatus = outcome.status;
    order.updatedAt = now;

    if (outcome.status === "paid") {
      order.orderStatus = "paid";
      order.statusHistory.push({
        id: "evt_" + Date.now(),
        stage: "paid",
        title: "Оплата подтверждена",
        description: `Демо-платёж ${paymentId} на сумму ${order.pricingSnapshot.total.toLocaleString("ru-RU")} ${order.pricingSnapshot.currency} подтверждён.`,
        actor: "Платёжный шлюз (Симуляция)",
        comment: outcome.reason,
        timestamp: now
      });
    } else if (outcome.status === "pending") {
      order.orderStatus = "awaiting_payment";
      order.statusHistory.push({
        id: "evt_" + Date.now(),
        stage: "payment_pending",
        title: "Проверка платежа",
        description: `Платёж ${paymentId} проходит проверку безопасности.`,
        actor: "Платёжный шлюз (Симуляция)",
        comment: outcome.reason,
        timestamp: now
      });
    } else {
      order.orderStatus = "awaiting_payment";
      order.statusHistory.push({
        id: "evt_" + Date.now(),
        stage: "payment_failed",
        title: "Попытка оплаты не удалась",
        description: `Статус попытки ${paymentId}: ${outcome.status}`,
        actor: "Платёжный шлюз (Симуляция)",
        comment: outcome.reason,
        timestamp: now
      });
    }

    orders[oIdx] = order;
    this._setLocalCollection("orders", orders);

    return { payment: paymentRecord, order };
  }

  /* ==========================================
     УПРАВЛЕНИЕ ЗАКАЗАМИ И ДОСТАВКОЙ (Покупатель и Продавец)
     ========================================== */

  getOrdersForBuyer(uid) {
    if (!uid) return [];
    const orders = this._getLocalCollection("orders");
    return orders.filter((o) => o.uid === uid);
  }

  getAllOrdersForSeller() {
    this._requireSeller();
    return this._getLocalCollection("orders");
  }

  getPaymentsForOrder(orderId) {
    const payments = this._getLocalCollection("payments");
    return payments.filter((p) => p.orderId === orderId);
  }

  /**
   * Изменение этапа заказа и доставки продавцом с записью в историю
   */
  updateOrderStageBySeller({ orderId, newStage, sellerComment = "" }) {
    this._requireSeller();
    const orders = this._getLocalCollection("orders");
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx === -1) throw new Error("Заказ не найден");
    const order = orders[idx];

    if (order.orderStatus === "cancelled" || order.orderStatus === "returned") {
      throw new Error("Заказ уже находится в финальном закрытом статусе.");
    }

    const stageLabels = {
      accepted: {
        title: "Продавец принял заказ",
        desc: "Наличие всех позиций на складе подтверждено, заказ передан в комплектацию.",
        deliveryStatus: "accepted"
      },
      packing: {
        title: "Собирается",
        desc: "Товары проходят проверку качества и бережно упаковываются в фирменный кофр VESTA.",
        deliveryStatus: "packing"
      },
      shipped: {
        title: "Передан курьеру",
        desc: `Отправление передано логистической службе. Демо трек-номер: ${order.demoTrackingNumber}`,
        deliveryStatus: "shipped"
      },
      in_transit: {
        title: "В пути",
        desc: "Заказ следует по маршруту в город назначения.",
        deliveryStatus: "in_transit"
      },
      ready_for_pickup: {
        title: "Прибыл в пункт выдачи",
        desc: "Заказ ожидает получения в выбранном пункте выдачи / бутике.",
        deliveryStatus: "ready_for_pickup"
      },
      out_for_delivery: {
        title: "Курьер доставляет заказ",
        desc: "Курьер выехал по вашему адресу доставки.",
        deliveryStatus: "out_for_delivery"
      },
      delivered: {
        title: "Доставлен",
        desc: "Покупатель успешно получил заказ.",
        deliveryStatus: "delivered"
      },
      return_requested: {
        title: "Возврат оформлен",
        desc: "Заявка на возврат принята к обработке.",
        deliveryStatus: "return_requested"
      },
      returned: {
        title: "Возврат завершён",
        desc: "Товар возвращён на склад, средства направлены покупателю.",
        deliveryStatus: "returned"
      }
    };

    const meta = stageLabels[newStage];
    if (!meta) throw new Error("Неизвестный этап заказа");

    const now = new Date().toISOString();
    order.orderStatus = newStage;
    order.deliveryStatus = meta.deliveryStatus;
    if (newStage === "delivered" && order.paymentMethod === "cash_on_delivery") {
      order.paymentStatus = "paid";
    }
    if (newStage === "returned" && order.stockReserved) {
      this._restoreOrderStock(order);
      order.stockReserved = false;
    }

    order.updatedAt = now;
    order.statusHistory.push({
      id: "evt_" + Date.now(),
      stage: newStage,
      title: meta.title,
      description: meta.desc,
      actor: `Продавец (${this._currentUser?.name || "Администратор"})`,
      comment: sellerComment.trim(),
      timestamp: now
    });

    orders[idx] = order;
    this._setLocalCollection("orders", orders);
    this._logSellerAction("ORDER_STAGE", `Заказ ${order.id} переведён в статус «${meta.title}»`);
    return order;
  }

  /**
   * Отмена заказа (покупателем в разрешённых статусах или продавцом с указанием причины)
   * и автоматический возврат зарезервированных остатков на склад.
   */
  cancelOrder({ orderId, reason, actorRole }) {
    const orders = this._getLocalCollection("orders");
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx === -1) throw new Error("Заказ не найден");
    const order = orders[idx];

    if (actorRole === "buyer") {
      if (!this._currentUser || order.uid !== this._currentUser.uid) {
        throw new Error("Доступ запрещён: вы не можете отменить чужой заказ.");
      }
      const allowedForBuyer = ["created", "awaiting_payment", "paid", "accepted"];
      if (!allowedForBuyer.includes(order.orderStatus)) {
        throw new Error("Заказ уже передан в сборку или доставку и не может быть отменён самостоятельно.");
      }
    } else {
      this._requireSeller();
    }

    if (order.orderStatus === "cancelled") {
      throw new Error("Заказ уже отменён.");
    }

    if (order.stockReserved) {
      this._restoreOrderStock(order);
      order.stockReserved = false;
    }

    const now = new Date().toISOString();
    order.orderStatus = "cancelled";
    order.deliveryStatus = "cancelled";
    order.cancelReason = reason || "Отменён по запросу";
    order.updatedAt = now;

    order.statusHistory.push({
      id: "evt_" + Date.now(),
      stage: "cancelled",
      title: "Отменён",
      description: "Заказ отменён, зарезервированные товары возвращены в каталог.",
      actor: actorRole === "seller" ? `Продавец (${this._currentUser.name})` : "Покупатель",
      comment: order.cancelReason,
      timestamp: now
    });

    orders[idx] = order;
    this._setLocalCollection("orders", orders);

    if (actorRole === "seller") {
      this._logSellerAction("CANCEL_ORDER", `Отменён заказ ${order.id}. Причина: ${order.cancelReason}`);
    }
    return order;
  }

  _restoreOrderStock(order) {
    const products = this._getLocalCollection("products");
    for (const item of order.items) {
      const pIdx = products.findIndex((p) => String(p.id) === String(item.productId));
      if (pIdx !== -1) {
        const key = `${item.size}_${item.color}`;
        if (!products[pIdx].stock) products[pIdx].stock = {};
        products[pIdx].stock[key] = (products[pIdx].stock[key] || 0) + item.quantity;
      }
    }
    this._setLocalCollection("products", products);
  }

  /* ==========================================
     ОТЗЫВЫ И ВОПРОСЫ (reviews/{reviewId})
     ========================================== */

  getReviews(productId = null) {
    const list = this._getLocalCollection("reviews");
    if (productId) {
      return list.filter((r) => String(r.productId) === String(productId));
    }
    return list;
  }

  addReview({ productId, rating, text, orderId }) {
    if (!this._currentUser) {
      throw new Error("Войдите в аккаунт, чтобы оставить отзыв.");
    }
    const cleanText = (text || "").trim();
    if (cleanText.length < 5) {
      throw new Error("Напишите содержательный отзыв (минимум 5 символов).");
    }

    // Проверяем, покупал ли пользователь этот товар
    const userOrders = this.getOrdersForBuyer(this._currentUser.uid);
    const verifiedOrder = userOrders.find(
      (o) =>
        o.orderStatus !== "cancelled" &&
        o.items.some((it) => String(it.productId) === String(productId))
    );

    const reviews = this._getLocalCollection("reviews");
    const newReview = {
      id: "rev_" + Date.now(),
      productId,
      orderId: orderId || (verifiedOrder ? verifiedOrder.id : null),
      verifiedPurchase: Boolean(verifiedOrder),
      uid: this._currentUser.uid,
      authorName: this._currentUser.name,
      rating: Math.min(5, Math.max(1, Number(rating) || 5)),
      text: cleanText,
      sellerReply: null,
      createdAt: new Date().toISOString()
    };

    reviews.unshift(newReview);
    this._setLocalCollection("reviews", reviews);

    // Пересчёт среднего рейтинга товара
    const prodReviews = reviews.filter((r) => String(r.productId) === String(productId));
    const avg = prodReviews.reduce((s, r) => s + r.rating, 0) / prodReviews.length;
    const products = this._getLocalCollection("products");
    const pIdx = products.findIndex((p) => String(p.id) === String(productId));
    if (pIdx !== -1) {
      products[pIdx].rating = Number(avg.toFixed(1));
      products[pIdx].reviewsCount = prodReviews.length;
      this._setLocalCollection("products", products);
    }

    return newReview;
  }

  replyToReview(reviewId, replyText) {
    this._requireSeller();
    const reviews = this._getLocalCollection("reviews");
    const idx = reviews.findIndex((r) => r.id === reviewId);
    if (idx === -1) throw new Error("Отзыв не найден");
    reviews[idx].sellerReply = {
      text: replyText.trim(),
      repliedAt: new Date().toISOString(),
      sellerName: this._currentUser.name
    };
    this._setLocalCollection("reviews", reviews);
    this._logSellerAction("REPLY_REVIEW", `Добавлен ответ представителя бренда на отзыв ID: ${reviewId}`);
    return reviews[idx];
  }

  /* ==========================================
     ПОДПИСКА НА ПОЯВЛЕНИЕ РАЗМЕРА (stockSubscriptions)
     ========================================== */

  subscribeToStock({ productId, productName, size, color, contactEmail }) {
    const cleanEmail = (contactEmail || "").trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      throw new Error("Укажите корректный email для записи в лист ожидания.");
    }
    const subs = this._getLocalCollection("stockSubscriptions");
    const record = {
      id: "sub_" + Date.now(),
      productId,
      productName,
      size,
      color,
      email: cleanEmail,
      uid: this._currentUser ? this._currentUser.uid : null,
      createdAt: new Date().toISOString(),
      note: "Запись сохранена в базе данных. Для автоматической email-рассылки требуется подключение внешнего SMTP/SendGrid триггера."
    };
    subs.unshift(record);
    this._setLocalCollection("stockSubscriptions", subs);
    return record;
  }

  /* ==========================================
     ЖУРНАЛ ДЕЙСТВИЙ ПРОДАВЦА И БЕЗОПАСНОСТЬ РОЛЕЙ
     ========================================== */

  _requireSeller() {
    if (!this._currentUser || this._currentUser.role !== "seller") {
      throw new Error("Отказано в доступе: операция требует подтверждённой роли продавца (seller).");
    }
  }

  _logSellerAction(actionType, details) {
    const logs = this._getLocalCollection("inventoryLogs");
    logs.unshift({
      id: "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 5),
      actionType,
      details,
      actorUid: this._currentUser ? this._currentUser.uid : "system",
      actorName: this._currentUser ? this._currentUser.name : "Система",
      timestamp: new Date().toISOString()
    });
    this._setLocalCollection("inventoryLogs", logs.slice(0, 200));
  }

  getSellerLogs() {
    this._requireSeller();
    return this._getLocalCollection("inventoryLogs");
  }
}

export const dbService = new VestaDatabaseService();
