/**
 * VESTA — Основное приложение покупателя, маршрутизация (/ и /seller),
 * корзина с сохранением размера и цвета, пошаговый Checkout, симулятор банковской оплаты
 * с 5 сценариями и временная шкала доставки (12 этапов).
 */

import { dbService, isFirebaseConfigured } from "./firebase.js";
import { INITIAL_SEED_DATA, LOOKBOOK_OUTFITS } from "./products.js";
import { SellerPanelController } from "./seller.js";

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(val, currency = "₸") {
  return `${Number(val || 0).toLocaleString("ru-RU")} ${currency}`;
}

class VestaStoreApp {
  constructor() {
    this.products = [];
    this.categories = [];
    this.cart = { items: [], promoCode: null };
    this.favorites = [];
    this.compareIds = JSON.parse(localStorage.getItem("vesta_compare_ids") || "[]");
    this.recentlyViewedIds = JSON.parse(localStorage.getItem("vesta_recent_ids") || "[]");

    this.filters = {
      search: "",
      category: "all",
      collectionTag: "all", // all | new | sale | bestseller
      size: "all",
      color: "all",
      brand: "all",
      season: "all",
      maxPrice: 100000,
      onlyInStock: false,
      sort: "new" // new | priceAsc | priceDesc | rating | discount
    };

    // Текущий выбранный вариант в модальном окне карточки товара
    this.detailState = {
      productId: null,
      selectedSize: null,
      selectedColor: null,
      activeImageIdx: 0
    };

    // Состояние пошагового оформления заказа
    this.checkoutState = {
      step: 1,
      name: "",
      phone: "",
      email: "",
      address: "",
      comment: "",
      deliveryMethod: "courier", // courier | pickup_point | pickup_store
      paymentMethod: "demo_card", // demo_card | demo_wallet | cash_on_delivery
      idempotencyKey: null,
      isSubmitting: false
    };

    // Переключатель режима симуляции оплаты для разработчика
    this.simulationScenario = localStorage.getItem("vesta_sim_scenario") || "paid";
    this.activePaymentOrder = null;
    this.accountSection = "profile";

    this.sellerController = new SellerPanelController(
      dbService,
      (msg) => this.toast(msg),
      () => this.refreshAllData()
    );
  }

  async init() {
    this.initTheme();
    this.initNetworkListeners();

    await dbService.init(INITIAL_SEED_DATA);
    this.renderFirebaseBanner();

    dbService.onAuthChange((user) => {
      this.loadUserScopedState(user);
      this.renderHeaderAuthState(user);
      this.handleRoute();
    });

    dbService.onDataChange(() => {
      this.refreshAllData();
    });

    window.addEventListener("hashchange", () => this.handleRoute());
    window.addEventListener("vesta:open-auth", (e) => {
      this.openAuthModal(e.detail?.preset || null);
    });

    await this.refreshAllData();
    this.bindStaticEvents();
    this.handleRoute();
  }

  initTheme() {
    if (localStorage.getItem("vestaDark") === "true") {
      document.body.classList.add("dark");
    }
  }

  toggleTheme() {
    document.body.classList.toggle("dark");
    localStorage.setItem("vestaDark", document.body.classList.contains("dark"));
  }

  initNetworkListeners() {
    const banner = document.getElementById("offlineBanner");
    const updateStatus = () => {
      if (!navigator.onLine) {
        banner?.classList.add("active");
      } else {
        banner?.classList.remove("active");
      }
    };
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    updateStatus();
  }

  renderFirebaseBanner() {
    const pill = document.getElementById("firebaseModePill");
    const note = document.getElementById("firebaseModeNote");
    if (!pill || !note) return;

    if (isFirebaseConfigured()) {
      pill.className = "status-pill cloud";
      pill.textContent = "☁️ Firebase Cloud подключён";
      note.textContent = "Данные синхронизируются с вашим проектом Cloud Firestore и Firebase Auth.";
    } else {
      pill.className = "status-pill demo";
      pill.textContent = "⚠️ Демо-база (Firebase не настроен)";
      note.innerHTML =
        "Вставьте ключи своего проекта в <code>firebase.js</code> (блок <b>TODO</b>). Сейчас работает локальный транзакционный эмулятор коллекций Firestore с сохранением между перезагрузками.";
    }

    const simSelect = document.getElementById("devSimScenarioSelect");
    if (simSelect) {
      simSelect.value = this.simulationScenario;
      simSelect.addEventListener("change", (e) => {
        this.simulationScenario = e.target.value;
        localStorage.setItem("vesta_sim_scenario", this.simulationScenario);
        this.toast(`Режим симулятора банка: ${e.target.options[e.target.selectedIndex].text}`);
      });
    }
  }

  loadUserScopedState(user) {
    const uid = user ? user.uid : null;
    this.cart = dbService.getCart(uid);
    this.favorites = dbService.getFavorites(uid);

    if (user) {
      this.checkoutState.name = user.name || "";
      this.checkoutState.phone = user.phone || "";
      this.checkoutState.email = user.email || "";
      if (user.addresses && user.addresses.length > 0 && !this.checkoutState.address) {
        this.checkoutState.address = user.addresses[0];
      }
    }
    this.updateHeaderCounters();
  }

  async refreshAllData() {
    this.products = await dbService.getProducts();
    this.categories = await dbService.getCategories();
    this.renderCategories();
    this.renderCatalog();
    this.renderCuratedSections();
    this.renderLookbooks();
    this.renderRecentlyViewed();
    this.renderFooterContacts();
    this.updateHeaderCounters();

    if (window.location.hash.startsWith("#/seller")) {
      const sellerBox = document.getElementById("sellerWorkspace");
      if (sellerBox) this.sellerController.renderWorkspace(sellerBox);
    }
  }

  handleRoute() {
    const hash = window.location.hash || "#/";
    const buyerView = document.getElementById("buyerWorkspace");
    const sellerView = document.getElementById("sellerWorkspace");

    if (hash.startsWith("#/seller")) {
      buyerView.style.display = "none";
      sellerView.classList.add("active");
      this.sellerController.renderWorkspace(sellerView);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      sellerView.classList.remove("active");
      buyerView.style.display = "block";
    }
  }

  renderHeaderAuthState(user) {
    const authLabel = document.getElementById("headerUserLabel");
    const sellerBtn = document.getElementById("headerSellerBtn");
    if (authLabel) {
      authLabel.textContent = user ? user.name.split(" ")[0] : "Войти";
    }
    if (sellerBtn) {
      sellerBtn.style.display = user && user.role === "seller" ? "inline-flex" : "none";
    }
  }

  updateHeaderCounters() {
    const totalQty = (this.cart.items || []).reduce((sum, it) => sum + it.quantity, 0);
    const cartCountEl = document.getElementById("cartCount");
    const mobileCartCountEl = document.getElementById("mobileCartCount");
    const favCountEl = document.getElementById("favCount");
    const compareCountEl = document.getElementById("compareCount");

    if (cartCountEl) cartCountEl.textContent = totalQty;
    if (mobileCartCountEl) mobileCartCountEl.textContent = totalQty;
    if (favCountEl) favCountEl.textContent = this.favorites.length;
    if (compareCountEl) compareCountEl.textContent = this.compareIds.length;
  }

  /* ==========================================
     ПОИСК С ПОДСКАЗКАМИ, КАТЕГОРИИ И КАТАЛОГ
     ========================================== */

  getTotalStockForProduct(p) {
    if (!p.stock) return 0;
    return Object.values(p.stock).reduce((s, q) => s + (Number(q) || 0), 0);
  }

  getVariantStock(p, size, color) {
    if (!p || !p.stock) return 0;
    return Number(p.stock[`${size}_${color}`]) || 0;
  }

  renderCategories() {
    const grid = document.getElementById("categoriesGrid");
    const select = document.getElementById("categoryFilter");
    if (!grid) return;

    grid.innerHTML = this.categories
      .map(
        (c) => `
      <article class="category-card" data-category="${escapeHtml(c.name)}" tabindex="0" role="button" aria-label="Категория ${escapeHtml(c.name)}">
        <img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}" loading="lazy">
        <div class="category-overlay">
          <h3>${escapeHtml(c.name)}</h3>
          <p>${escapeHtml(c.subtitle || "")}</p>
        </div>
      </article>
    `
      )
      .join("");

    grid.querySelectorAll(".category-card").forEach((card) => {
      card.addEventListener("click", () => {
        this.setCategoryFilter(card.dataset.category);
      });
    });

    if (select) {
      const currentVal = select.value;
      select.innerHTML =
        `<option value="all">Все категории</option>` +
        this.categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
      select.value = currentVal || "all";
    }
  }

  setCategoryFilter(cat, collectionTag = "all") {
    this.filters.category = cat;
    this.filters.collectionTag = collectionTag;
    const catSelect = document.getElementById("categoryFilter");
    if (catSelect) {
      catSelect.value = cat === "all" ? "all" : cat;
    }
    this.renderCatalog();
    document.getElementById("catalogSection")?.scrollIntoView({ behavior: "smooth" });
  }

  renderSearchSuggestions(query) {
    const box = document.getElementById("searchSuggestions");
    if (!box) return;
    const q = (query || "").trim().toLowerCase();
    if (q.length < 2) {
      box.classList.remove("active");
      return;
    }

    const matches = this.products
      .filter(
        (p) =>
          !p.archived &&
          (p.name.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q))
      )
      .slice(0, 5);

    if (!matches.length) {
      box.innerHTML = `<div style="padding: 12px 16px; font-size: 13px; color: var(--text-muted);">Ничего не найдено по запросу «${escapeHtml(query)}»</div>`;
      box.classList.add("active");
      return;
    }

    box.innerHTML = matches
      .map(
        (p) => `
      <div class="suggestion-item" data-id="${escapeHtml(p.id)}">
        <img src="${escapeHtml(p.images?.[0] || "")}" alt="${escapeHtml(p.name)}">
        <div style="flex: 1;">
          <div style="font-size: 13px; font-weight: 600;">${escapeHtml(p.name)}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(p.brand)} · ${escapeHtml(p.category)}</div>
        </div>
        <div style="font-size: 13px; font-weight: 700;">${money(p.price)}</div>
      </div>
    `
      )
      .join("");

    box.classList.add("active");
    box.querySelectorAll(".suggestion-item").forEach((el) => {
      el.addEventListener("click", () => {
        box.classList.remove("active");
        this.openProductModal(el.dataset.id);
      });
    });
  }

  renderCatalog() {
    const container = document.getElementById("catalogProductsGrid");
    const countLabel = document.getElementById("catalogCountLabel");
    if (!container) return;

    const q = this.filters.search.trim().toLowerCase();

    let list = this.products.filter((p) => {
      if (p.archived) return false;
      const totalStock = this.getTotalStockForProduct(p);

      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q);

      const matchesCategory = this.filters.category === "all" || p.category === this.filters.category;

      const matchesTag =
        this.filters.collectionTag === "all" ||
        (this.filters.collectionTag === "sale" && (p.isSale || p.oldPrice > p.price)) ||
        (this.filters.collectionTag === "new" && p.isNew) ||
        (this.filters.collectionTag === "bestseller" && p.isBestseller);

      const matchesSize = this.filters.size === "all" || (p.sizes || []).includes(this.filters.size);
      const colorsArr = p.colors || (p.color ? [p.color] : []);
      const matchesColor = this.filters.color === "all" || colorsArr.includes(this.filters.color);
      const matchesBrand = this.filters.brand === "all" || p.brand === this.filters.brand;
      const matchesSeason = this.filters.season === "all" || p.season === this.filters.season;
      const matchesPrice = p.price <= this.filters.maxPrice;
      const matchesStock = !this.filters.onlyInStock || totalStock > 0;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesTag &&
        matchesSize &&
        matchesColor &&
        matchesBrand &&
        matchesSeason &&
        matchesPrice &&
        matchesStock
      );
    });

    // Честная сортировка, включая реальную дату добавления createdAt для «Новизна»
    if (this.filters.sort === "new") {
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (this.filters.sort === "priceAsc") {
      list.sort((a, b) => a.price - b.price);
    } else if (this.filters.sort === "priceDesc") {
      list.sort((a, b) => b.price - a.price);
    } else if (this.filters.sort === "rating") {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (this.filters.sort === "discount") {
      const getDisc = (item) => (item.oldPrice && item.oldPrice > item.price ? (item.oldPrice - item.price) / item.oldPrice : 0);
      list.sort((a, b) => getDisc(b) - getDisc(a));
    }

    if (countLabel) {
      countLabel.textContent = `Найдено моделей: ${list.length}`;
    }

    if (!list.length) {
      container.innerHTML = `
        <div class="feature-card" style="grid-column: 1 / -1; text-align: center; padding: 42px;">
          <h3 style="margin-bottom: 8px;">По вашим параметрам ничего не найдено</h3>
          <p style="color: var(--text-muted); margin-bottom: 16px;">Попробуйте сбросить часть фильтров или увеличить диапазон цены.</p>
          <button class="secondary-btn" id="resetFiltersEmptyBtn">Сбросить все фильтры</button>
        </div>
      `;
      container.querySelector("#resetFiltersEmptyBtn")?.addEventListener("click", () => this.resetAllFilters());
      return;
    }

    container.innerHTML = list.map((p) => this.renderProductCardHtml(p)).join("");
    this.bindProductCardsEvents(container);
  }

  renderProductCardHtml(p) {
    const isFav = this.favorites.some((id) => String(id) === String(p.id));
    const isComp = this.compareIds.some((id) => String(id) === String(p.id));
    const totalStock = this.getTotalStockForProduct(p);
    const settings = dbService.getStoreSettings();
    const colorsArr = p.colors || (p.color ? [p.color] : ["Чёрный"]);
    const sizesArr = p.sizes || ["ONE SIZE"];
    const discountPercent =
      p.oldPrice && p.oldPrice > p.price ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100) : 0;

    return `
      <article class="product-card" data-product-id="${escapeHtml(p.id)}">
        <div class="product-media open-detail-trigger" data-id="${escapeHtml(p.id)}">
          <img src="${escapeHtml(p.images?.[0] || "")}" alt="${escapeHtml(p.name)}" loading="lazy">
          <div class="badges-stack">
            ${discountPercent > 0 ? `<span class="badge-tag sale">−${discountPercent}%</span>` : ""}
            ${p.isNew ? `<span class="badge-tag new">NEW</span>` : ""}
            ${
              totalStock === 0
                ? `<span class="badge-tag out">Нет в наличии</span>`
                : totalStock <= settings.lowStockThreshold
                ? `<span class="badge-tag low-stock">Осталось ${totalStock} шт.</span>`
                : ""
            }
          </div>
          <div class="card-QuickActions">
            <button class="circle-action-btn fav-toggle-btn ${isFav ? "active" : ""}" data-id="${escapeHtml(p.id)}" title="В избранное" aria-label="Добавить в избранное">
              ${isFav ? "♥" : "♡"}
            </button>
            <button class="circle-action-btn compare-toggle-btn ${isComp ? "active" : ""}" data-id="${escapeHtml(p.id)}" title="Сравнить модель" aria-label="Добавить к сравнению">
              ⇄
            </button>
          </div>
        </div>

        <div class="product-body">
          <div class="product-brand-row">
            <span>${escapeHtml(p.brand)}</span>
            <span style="color: #e5a400;">★ ${Number(p.rating || 5).toFixed(1)} (${p.reviewsCount ?? p.reviews ?? 0})</span>
          </div>
          <h3 class="product-title open-detail-trigger" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</h3>
          <div class="product-variants-preview">
            Размеры: ${escapeHtml(sizesArr.join(", "))} · Цвета: ${escapeHtml(colorsArr.join(", "))}
          </div>
          <div class="product-price-row">
            <span class="price-current">${money(p.price)}</span>
            ${p.oldPrice ? `<span class="price-old">${money(p.oldPrice)}</span>` : ""}
          </div>
          <button class="primary-btn quick-add-btn" data-id="${escapeHtml(p.id)}" style="width: 100%; padding: 10px 16px; font-size: 13px;">
            ${totalStock > 0 ? "Выбрать размер / В корзину" : "Сообщить о поступлении"}
          </button>
        </div>
      </article>
    `;
  }

  bindProductCardsEvents(scopeEl) {
    scopeEl.querySelectorAll(".open-detail-trigger").forEach((el) => {
      el.addEventListener("click", () => this.openProductModal(el.dataset.id));
    });
    scopeEl.querySelectorAll(".quick-add-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.openProductModal(btn.dataset.id));
    });
    scopeEl.querySelectorAll(".fav-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleFavorite(btn.dataset.id);
      });
    });
    scopeEl.querySelectorAll(".compare-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleCompare(btn.dataset.id);
      });
    });
  }

  /* ==========================================
     СЕКЦИИ «НОВИНКИ / ХИТЫ / СКИДКИ» И КОМПЛЕКТЫ ОБРАЗОВ
     ========================================== */

  renderCuratedSections() {
    const box = document.getElementById("curatedHighlightsGrid");
    if (!box) return;
    const activeTab = box.dataset.tab || "new";
    const list = this.products
      .filter((p) => {
        if (p.archived) return false;
        if (activeTab === "sale") return p.isSale || (p.oldPrice && p.oldPrice > p.price);
        if (activeTab === "bestseller") return p.isBestseller;
        return p.isNew;
      })
      .slice(0, 4);

    box.innerHTML = list.map((p) => this.renderProductCardHtml(p)).join("");
    this.bindProductCardsEvents(box);
  }

  renderLookbooks() {
    const box = document.getElementById("lookbooksGrid");
    if (!box) return;

    box.innerHTML = LOOKBOOK_OUTFITS.map((look) => {
      const items = look.productIds
        .map((id) => this.products.find((p) => String(p.id) === String(id)))
        .filter(Boolean);
      const total = items.reduce((s, p) => s + p.price, 0);

      return `
        <div class="lookbook-card">
          <div>
            <span class="badge-tag new" style="display: inline-block; margin-bottom: 10px;">${escapeHtml(look.badge)}</span>
            <h3 style="font-family: var(--font-serif); font-size: 24px; margin-bottom: 6px;">${escapeHtml(look.title)}</h3>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">${escapeHtml(look.subtitle)}</p>
            <div class="lookbook-thumbs">
              ${items
                .map(
                  (it) => `
                <img src="${escapeHtml(it.images?.[0] || "")}" alt="${escapeHtml(it.name)}" title="${escapeHtml(it.name)} (${money(it.price)})" class="look-item-img" data-id="${escapeHtml(it.id)}">
              `
                )
                .join("")}
            </div>
          </div>
          <div style="border-top: 1px solid var(--border); padding-top: 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 11px; color: var(--text-muted);">Стоимость комплекта (${items.length} вещ.):</div>
              <div style="font-size: 18px; font-weight: 700;">${money(total)}</div>
            </div>
            <button class="primary-btn add-look-btn" data-look-id="${escapeHtml(look.id)}" style="padding: 10px 18px; font-size: 13px;">
              Добавить образ
            </button>
          </div>
        </div>
      `;
    }).join("");

    box.querySelectorAll(".look-item-img").forEach((img) => {
      img.addEventListener("click", () => this.openProductModal(img.dataset.id));
    });

    box.querySelectorAll(".add-look-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const look = LOOKBOOK_OUTFITS.find((l) => l.id === btn.dataset.lookId);
        if (!look) return;
        let added = 0;
        look.productIds.forEach((pid) => {
          const p = this.products.find((x) => String(x.id) === String(pid));
          if (!p) return;
          const size = look.defaultSizes[pid] || p.sizes?.[0] || "ONE SIZE";
          const color = look.defaultColors[pid] || p.colors?.[0] || p.color || "Чёрный";
          if (this.getVariantStock(p, size, color) > 0) {
            this.addToCart(p.id, size, color, 1, true);
            added++;
          }
        });
        if (added > 0) {
          this.toast(`Комплект «${look.title}» (${added} поз.) добавлен в корзину`);
          this.openCartModal();
        } else {
          this.toast("Некоторые позиции комплекта сейчас закончились на складе.");
        }
      });
    });
  }

  /* ==========================================
     КАРТОЧКА ТОВАРА (МОДАЛЬНОЕ ОКНО С ВЫБОРОМ РАЗМЕРА И ЦВЕТА)
     ========================================== */

  openProductModal(productId) {
    const p = this.products.find((x) => String(x.id) === String(productId));
    if (!p) return;

    // Сохраняем в «Недавно просмотренные»
    this.recentlyViewedIds = [
      p.id,
      ...this.recentlyViewedIds.filter((id) => String(id) !== String(p.id))
    ].slice(0, 6);
    localStorage.setItem("vesta_recent_ids", JSON.stringify(this.recentlyViewedIds));
    this.renderRecentlyViewed();

    const sizes = p.sizes || ["ONE SIZE"];
    const colors = p.colors || (p.color ? [p.color] : ["Чёрный"]);

    // Выбираем первый доступный на складе вариант по умолчанию
    let defaultSize = sizes[0];
    let defaultColor = colors[0];
    outer: for (const c of colors) {
      for (const s of sizes) {
        if (this.getVariantStock(p, s, c) > 0) {
          defaultSize = s;
          defaultColor = c;
          break outer;
        }
      }
    }

    this.detailState = {
      productId: p.id,
      selectedSize: defaultSize,
      selectedColor: defaultColor,
      activeImageIdx: 0
    };

    this.renderProductModalContent();
    document.getElementById("productModal")?.classList.add("active");
  }

  renderProductModalContent() {
    const p = this.products.find((x) => String(x.id) === String(this.detailState.productId));
    const box = document.getElementById("productDetailBox");
    if (!p || !box) return;

    const sizes = p.sizes || ["ONE SIZE"];
    const colors = p.colors || (p.color ? [p.color] : ["Чёрный"]);
    const variantStock = this.getVariantStock(p, this.detailState.selectedSize, this.detailState.selectedColor);
    const reviews = dbService.getReviews(p.id);
    const similar = this.products
      .filter((x) => !x.archived && x.category === p.category && String(x.id) !== String(p.id))
      .slice(0, 3);

    box.innerHTML = `
      <button class="modal-close" id="closeProductModalBtn" aria-label="Закрыть">×</button>

      <div class="product-detail-layout">
        <div>
          <img src="${escapeHtml(p.images?.[this.detailState.activeImageIdx] || p.images?.[0] || "")}" alt="${escapeHtml(p.name)}" class="detail-main-img">
          <div class="detail-thumbs">
            ${(p.images || [])
              .map(
                (img, idx) => `
              <img src="${escapeHtml(img)}" alt="" class="detail-thumb-item ${idx === this.detailState.activeImageIdx ? "active" : ""}" data-idx="${idx}">
            `
              )
              .join("")}
          </div>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted);">${escapeHtml(p.brand)} · ${escapeHtml(p.collection || p.category)}</span>
            <span style="color: #e5a400; font-size: 14px;">★ ${Number(p.rating || 5).toFixed(1)} (${reviews.length} отз.)</span>
          </div>

          <h2 style="font-family: var(--font-serif); font-size: 32px; margin: 8px 0;">${escapeHtml(p.name)}</h2>

          <div style="display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px;">
            <span style="font-size: 24px; font-weight: 700;">${money(p.price)}</span>
            ${p.oldPrice ? `<span class="price-old" style="font-size: 16px;">${money(p.oldPrice)}</span>` : ""}
          </div>

          <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 14px;">${escapeHtml(p.description)}</p>

          ${
            p.fabric
              ? `<div style="font-size: 12px; color: var(--text-muted); padding: 10px 12px; background: var(--bg); border-radius: var(--radius-sm); margin-bottom: 14px;">
                  <b>Состав:</b> ${escapeHtml(p.fabric)}<br>
                  <b>Уход:</b> ${escapeHtml(p.care || "Бережный уход")}
                </div>`
              : ""
          }

          <div class="option-group">
            <div class="option-label">
              <span>Цвет: <b>${escapeHtml(this.detailState.selectedColor)}</b></span>
            </div>
            <div class="option-pills">
              ${colors
                .map(
                  (col) => `
                <button type="button" class="pill-btn select-color-btn ${col === this.detailState.selectedColor ? "selected" : ""}" data-color="${escapeHtml(col)}">
                  ${escapeHtml(col)}
                </button>
              `
                )
                .join("")}
            </div>
          </div>

          <div class="option-group">
            <div class="option-label">
              <span>Размер: <b>${escapeHtml(this.detailState.selectedSize)}</b></span>
              <span style="color: ${variantStock > 0 ? "var(--success)" : "var(--sale)"};">
                ${variantStock > 0 ? `В наличии: ${variantStock} шт.` : "Нет в наличии"}
              </span>
            </div>
            <div class="option-pills">
              ${sizes
                .map((sz) => {
                  const st = this.getVariantStock(p, sz, this.detailState.selectedColor);
                  return `
                  <button type="button" class="pill-btn select-size-btn ${sz === this.detailState.selectedSize ? "selected" : ""} ${st === 0 ? "out-of-stock" : ""}" data-size="${escapeHtml(sz)}">
                    ${escapeHtml(sz)}
                  </button>
                `;
                })
                .join("")}
            </div>
          </div>

          ${
            variantStock > 0
              ? `<button class="primary-btn" id="detailAddToCartBtn" style="width: 100%; margin-top: 10px;">
                  🛒 Добавить в корзину (${escapeHtml(this.detailState.selectedSize)} · ${escapeHtml(this.detailState.selectedColor)})
                </button>`
              : `<div class="summary-box" style="margin-top: 10px;">
                  <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">🔔 Лист ожидания на размер ${escapeHtml(this.detailState.selectedSize)} (${escapeHtml(this.detailState.selectedColor)})</div>
                  <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">
                    Запись сохраняется в базу данных магазина. Автоматическая email-рассылка сработает при подключённом почтовом сервисе.
                  </p>
                  <div style="display: flex; gap: 8px;">
                    <input type="email" id="waitlistEmailInput" placeholder="Ваш email" value="${escapeHtml(dbService.getCurrentUser()?.email || "")}" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-elevated)">
                    <button class="primary-btn" id="subscribeWaitlistBtn" style="padding: 10px 16px;">Записаться</button>
                  </div>
                </div>`
          }

          <details style="margin-top: 18px; border-top: 1px solid var(--border); padding-top: 12px;">
            <summary style="cursor: pointer; font-weight: 600; font-size: 13px;">📏 Таблица размеров и рекомендации по посадке</summary>
            <table class="size-table">
              <thead><tr><th>Размер</th><th>Обхват груди (см)</th><th>Талия (см)</th><th>Бёдра (см)</th></tr></thead>
              <tbody>
                <tr><td>XS</td><td>82–86</td><td>62–66</td><td>88–92</td></tr>
                <tr><td>S</td><td>86–90</td><td>66–70</td><td>92–96</td></tr>
                <tr><td>M</td><td>90–94</td><td>70–74</td><td>96–100</td></tr>
                <tr><td>L</td><td>94–100</td><td>74–80</td><td>100–106</td></tr>
                <tr><td>XL</td><td>100–106</td><td>80–86</td><td>106–112</td></tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>

      <!-- ОТЗЫВЫ И РЕКОМЕНДАЦИИ -->
      <div style="margin-top: 32px; border-top: 1px solid var(--border); padding-top: 24px; display: grid; grid-template-columns: 1.2fr 1fr; gap: 28px;">
        <div>
          <h3 style="margin-bottom: 12px;">Отзывы покупателей (${reviews.length})</h3>
          <div style="display: flex; flex-direction: column; gap: 12px; max-height: 260px; overflow-y: auto; margin-bottom: 16px;">
            ${
              reviews.length === 0
                ? `<p style="font-size: 13px; color: var(--text-muted);">Пока нет отзывов. Станьте первым!</p>`
                : reviews
                    .map(
                      (r) => `
                  <div style="border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px;">
                      <span><b>${escapeHtml(r.authorName)}</b> ${r.verifiedPurchase ? `<span class="badge-tag new" style="font-size:10px;padding:2px 6px;">Реальный заказ</span>` : ""}</span>
                      <span style="color: #e5a400;">${"★".repeat(r.rating)}</span>
                    </div>
                    <p style="font-size: 13px; margin-top: 4px;">${escapeHtml(r.text)}</p>
                    ${r.sellerReply ? `<div class="timeline-comment"><b>Ответ VESTA:</b> ${escapeHtml(r.sellerReply.text)}</div>` : ""}
                  </div>
                `
                    )
                    .join("")
            }
          </div>

          <form id="addReviewForm" class="form-grid" style="background: var(--bg); padding: 14px; border-radius: var(--radius-sm);">
            <div style="font-size: 13px; font-weight: 600;">Оставить отзыв о модели</div>
            <div style="display: flex; gap: 10px;">
              <select id="reviewRatingSelect" style="padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-elevated);">
                <option value="5">★★★★★ (5)</option>
                <option value="4">★★★★☆ (4)</option>
                <option value="3">★★★☆☆ (3)</option>
                <option value="2">★★☆☆☆ (2)</option>
                <option value="1">★☆☆☆☆ (1)</option>
              </select>
              <input type="text" id="reviewTextInput" placeholder="Поделитесь впечатлениями о ткани и размере..." required style="flex: 1; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-elevated);">
              <button type="submit" class="primary-btn" style="padding: 8px 16px; font-size: 12px;">Отправить</button>
            </div>
          </form>
        </div>

        <div>
          <h3 style="margin-bottom: 12px;">Похожие модели</h3>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${similar
              .map(
                (s) => `
              <div class="suggestion-item similar-prod-link" data-id="${escapeHtml(s.id)}" style="border: 1px solid var(--border); border-radius: var(--radius-sm);">
                <img src="${escapeHtml(s.images?.[0] || "")}" alt="${escapeHtml(s.name)}">
                <div style="flex: 1;">
                  <div style="font-size: 13px; font-weight: 600;">${escapeHtml(s.name)}</div>
                  <div style="font-size: 12px; color: var(--text-muted);">${money(s.price)}</div>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      </div>
    `;

    box.querySelector("#closeProductModalBtn")?.addEventListener("click", () => {
      document.getElementById("productModal")?.classList.remove("active");
    });

    box.querySelectorAll(".detail-thumb-item").forEach((img) => {
      img.addEventListener("click", () => {
        this.detailState.activeImageIdx = Number(img.dataset.idx);
        this.renderProductModalContent();
      });
    });

    box.querySelectorAll(".select-color-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.detailState.selectedColor = btn.dataset.color;
        this.renderProductModalContent();
      });
    });

    box.querySelectorAll(".select-size-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.detailState.selectedSize = btn.dataset.size;
        this.renderProductModalContent();
      });
    });

    box.querySelector("#detailAddToCartBtn")?.addEventListener("click", () => {
      this.addToCart(p.id, this.detailState.selectedSize, this.detailState.selectedColor, 1);
      document.getElementById("productModal")?.classList.remove("active");
    });

    box.querySelector("#subscribeWaitlistBtn")?.addEventListener("click", () => {
      const email = box.querySelector("#waitlistEmailInput")?.value;
      try {
        dbService.subscribeToStock({
          productId: p.id,
          productName: p.name,
          size: this.detailState.selectedSize,
          color: this.detailState.selectedColor,
          contactEmail: email
        });
        this.toast("Заявка сохранена в лист ожидания (без фиктивной отправки email)");
      } catch (err) {
        this.toast(err.message);
      }
    });

    box.querySelector("#addReviewForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        dbService.addReview({
          productId: p.id,
          rating: box.querySelector("#reviewRatingSelect").value,
          text: box.querySelector("#reviewTextInput").value
        });
        this.toast("Спасибо! Ваш отзыв опубликован");
        this.refreshAllData();
        this.renderProductModalContent();
      } catch (err) {
        this.toast(err.message);
      }
    });

    box.querySelectorAll(".similar-prod-link").forEach((el) => {
      el.addEventListener("click", () => this.openProductModal(el.dataset.id));
    });
  }

  /* ==========================================
     КОРЗИНА С СОХРАНЕНИЕМ РАЗМЕРА И ЦВЕТА
     ========================================== */

  addToCart(productId, size, color, qty = 1, silent = false) {
    const p = this.products.find((x) => String(x.id) === String(productId));
    if (!p) return;

    const chosenSize = size || p.sizes?.[0] || "ONE SIZE";
    const chosenColor = color || p.colors?.[0] || p.color || "Чёрный";
    const available = this.getVariantStock(p, chosenSize, chosenColor);

    const existing = this.cart.items.find(
      (it) => String(it.productId) === String(productId) && it.size === chosenSize && it.color === chosenColor
    );

    const nextQty = (existing ? existing.quantity : 0) + qty;
    if (nextQty > available) {
      if (!silent) {
        this.toast(`На складе доступно только ${available} шт. для варианта ${chosenSize} / ${chosenColor}`);
      }
      return;
    }

    if (existing) {
      existing.quantity = nextQty;
    } else {
      this.cart.items.push({
        productId: p.id,
        name: p.name,
        size: chosenSize,
        color: chosenColor,
        quantity: qty
      });
    }

    this.persistCart();
    if (!silent) {
      this.toast(`Добавлено в корзину: ${p.name} (${chosenSize}, ${chosenColor})`);
    }
  }

  persistCart() {
    const uid = dbService.getCurrentUser()?.uid || null;
    dbService.saveCart(uid, this.cart);
    this.updateHeaderCounters();
  }

  openCartModal() {
    this.renderCartModal();
    document.getElementById("cartModal")?.classList.add("active");
  }

  renderCartModal() {
    const box = document.getElementById("cartModalContent");
    if (!box) return;

    const uid = dbService.getCurrentUser()?.uid || null;
    const calc = dbService.calculateOrderTotals(
      this.cart.items,
      this.cart.promoCode,
      this.checkoutState.deliveryMethod,
      uid
    );

    if (!this.cart.items.length) {
      box.innerHTML = `
        <div style="text-align: center; padding: 36px 0;">
          <h3 style="margin-bottom: 8px;">Ваша корзина пока пуста</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 18px;">Выберите модели в каталоге или готовые образы из осенней капсулы.</p>
          <button class="primary-btn" id="emptyCartGoCatalogBtn">Перейти к покупкам</button>
        </div>
      `;
      box.querySelector("#emptyCartGoCatalogBtn")?.addEventListener("click", () => {
        document.getElementById("cartModal")?.classList.remove("active");
      });
      return;
    }

    box.innerHTML = `
      <div>
        ${calc.detailedItems
          .map(
            (it) => `
          <div class="cart-row">
            <img src="${escapeHtml(it.image)}" alt="${escapeHtml(it.name)}">
            <div>
              <div style="font-weight: 600; font-size: 15px;">${escapeHtml(it.name)}</div>
              <div style="font-size: 12px; color: var(--text-muted); margin: 4px 0;">
                Размер: <b>${escapeHtml(it.size)}</b> · Цвет: <b>${escapeHtml(it.color)}</b> · На складе: ${it.availableStock} шт.
              </div>
              <div style="font-weight: 700; font-size: 14px;">${money(it.unitPrice)} × ${it.quantity} = ${money(it.lineTotal)}</div>
            </div>
            <div class="qty-control">
              <button class="cart-qty-btn" data-id="${escapeHtml(it.productId)}" data-size="${escapeHtml(it.size)}" data-color="${escapeHtml(it.color)}" data-delta="-1">−</button>
              <span>${it.quantity}</span>
              <button class="cart-qty-btn" data-id="${escapeHtml(it.productId)}" data-size="${escapeHtml(it.size)}" data-color="${escapeHtml(it.color)}" data-delta="1">+</button>
            </div>
            <button class="secondary-btn cart-remove-btn" data-id="${escapeHtml(it.productId)}" data-size="${escapeHtml(it.size)}" data-color="${escapeHtml(it.color)}" style="padding: 6px 12px; font-size: 12px; color: var(--sale);">
              Удалить
            </button>
          </div>
        `
          )
          .join("")}
      </div>

      ${
        calc.stockErrors.length
          ? `<div style="margin-top: 14px; padding: 12px; background: rgba(201,59,59,0.12); color: var(--sale); border-radius: 8px; font-size: 13px;">
              ${calc.stockErrors.map((e) => `<div>⚠️ ${escapeHtml(e)}</div>`).join("")}
            </div>`
          : ""
      }

      <div style="display: flex; gap: 10px; margin-top: 18px;">
        <input type="text" id="cartPromoInput" placeholder="Промокод (например: VESTA10 или ATELIER5000)" value="${escapeHtml(this.cart.promoCode || "")}" style="flex: 1; padding: 11px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg);">
        <button class="secondary-btn" id="applyCartPromoBtn">Применить</button>
        ${this.cart.promoCode ? `<button class="secondary-btn" id="clearCartPromoBtn">Сбросить</button>` : ""}
      </div>
      ${calc.promoMessage ? `<p style="font-size: 12px; color: ${calc.appliedPromo ? "var(--success)" : "var(--sale)"}; margin-top: 6px;">${escapeHtml(calc.promoMessage)}</p>` : ""}

      <div class="summary-box">
        <div class="summary-line"><span>Стоимость товаров:</span><span>${money(calc.subtotal, calc.currency)}</span></div>
        ${
          calc.promoDiscount > 0
            ? `<div class="summary-line" style="color: var(--success);"><span>Скидка по промокоду (${escapeHtml(calc.appliedPromo.code)}):</span><span>−${money(calc.promoDiscount, calc.currency)}</span></div>`
            : ""
        }
        <div class="summary-line"><span>Доставка (${this.checkoutState.deliveryMethod === "pickup_store" ? "Самовывоз" : "Стандарт"}):</span><span>${calc.shippingCost === 0 ? "Бесплатно" : money(calc.shippingCost, calc.currency)}</span></div>
        <div class="summary-line total-line"><span>Итого к оплате:</span><span>${money(calc.total, calc.currency)}</span></div>
      </div>

      <div style="margin-top: 18px; display: flex; justify-content: flex-end;">
        <button class="primary-btn" id="proceedToCheckoutBtn" ${calc.stockErrors.length ? "disabled" : ""} style="width: 100%;">
          Перейти к оформлению заказа →
        </button>
      </div>
    `;

    box.querySelectorAll(".cart-qty-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const { id, size, color, delta } = btn.dataset;
        const item = this.cart.items.find(
          (x) => String(x.productId) === String(id) && x.size === size && x.color === color
        );
        if (!item) return;
        const p = this.products.find((x) => String(x.id) === String(id));
        const avail = this.getVariantStock(p, size, color);
        const next = item.quantity + Number(delta);
        if (next > avail) {
          this.toast(`Доступно максимум ${avail} шт.`);
          return;
        }
        if (next <= 0) {
          this.cart.items = this.cart.items.filter((x) => x !== item);
        } else {
          item.quantity = next;
        }
        this.persistCart();
        this.renderCartModal();
      });
    });

    box.querySelectorAll(".cart-remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const { id, size, color } = btn.dataset;
        this.cart.items = this.cart.items.filter(
          (x) => !(String(x.productId) === String(id) && x.size === size && x.color === color)
        );
        this.persistCart();
        this.renderCartModal();
      });
    });

    box.querySelector("#applyCartPromoBtn")?.addEventListener("click", () => {
      const code = box.querySelector("#cartPromoInput").value.trim().toUpperCase();
      this.cart.promoCode = code || null;
      this.persistCart();
      this.renderCartModal();
    });

    box.querySelector("#clearCartPromoBtn")?.addEventListener("click", () => {
      this.cart.promoCode = null;
      this.persistCart();
      this.renderCartModal();
    });

    box.querySelector("#proceedToCheckoutBtn")?.addEventListener("click", () => {
      document.getElementById("cartModal")?.classList.remove("active");
      this.checkoutState.step = 1;
      this.checkoutState.idempotencyKey = "ord_idem_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      this.openCheckoutModal();
    });
  }

  /* ==========================================
     ПОШАГОВОЕ ОФОРМЛЕНИЕ ЗАКАЗА И ИМИТАЦИЯ БАНКА
     ========================================== */

  openCheckoutModal() {
    this.renderCheckoutModal();
    document.getElementById("checkoutModal")?.classList.add("active");
  }

  renderCheckoutModal() {
    const box = document.getElementById("checkoutModalContent");
    if (!box) return;

    const uid = dbService.getCurrentUser()?.uid || null;
    const calc = dbService.calculateOrderTotals(
      this.cart.items,
      this.cart.promoCode,
      this.checkoutState.deliveryMethod,
      uid
    );

    box.innerHTML = `
      <div class="checkout-steps">
        <span class="step-badge ${this.checkoutState.step === 1 ? "active" : ""}">1. Контакты и адрес</span>
        <span class="step-badge ${this.checkoutState.step === 2 ? "active" : ""}">2. Доставка и способ оплаты</span>
        <span class="step-badge ${this.checkoutState.step === 3 ? "active" : ""}">3. Проверка и подтверждение</span>
      </div>

      ${
        this.checkoutState.step === 1
          ? `
        <form id="checkoutStep1Form" class="form-grid">
          <div class="form-field">
            <label>Имя и фамилия получателя *</label>
            <input type="text" id="chkName" required value="${escapeHtml(this.checkoutState.name)}" placeholder="Например: Анна Каримова">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-field">
              <label>Телефон для курьера *</label>
              <input type="tel" id="chkPhone" required value="${escapeHtml(this.checkoutState.phone)}" placeholder="+7 700 000 00 00">
            </div>
            <div class="form-field">
              <label>Email</label>
              <input type="email" id="chkEmail" value="${escapeHtml(this.checkoutState.email)}" placeholder="you@example.com">
            </div>
          </div>
          <div class="form-field">
            <label>Город, улица, дом, квартира *</label>
            <input type="text" id="chkAddress" required value="${escapeHtml(this.checkoutState.address)}" placeholder="г. Алматы, пр. Достык 89, кв. 12">
          </div>
          <div class="form-field">
            <label>Комментарий к доставке</label>
            <input type="text" id="chkComment" value="${escapeHtml(this.checkoutState.comment)}" placeholder="Код домофона, удобное время">
          </div>
          <button type="submit" class="primary-btn">Далее: выбор доставки и оплаты →</button>
        </form>
      `
          : ""
      }

      ${
        this.checkoutState.step === 2
          ? `
        <div class="form-grid">
          <div class="form-field">
            <label>Способ доставки</label>
            <select id="chkDeliveryMethod">
              <option value="courier" ${this.checkoutState.deliveryMethod === "courier" ? "selected" : ""}>Курьерская доставка до двери</option>
              <option value="pickup_point" ${this.checkoutState.deliveryMethod === "pickup_point" ? "selected" : ""}>Пункт выдачи заказов VESTA Box</option>
              <option value="pickup_store" ${this.checkoutState.deliveryMethod === "pickup_store" ? "selected" : ""}>Самовывоз из флагманского бутика (Бесплатно)</option>
            </select>
          </div>

          <div class="form-field">
            <label>Тестовый способ оплаты (без ввода реальных реквизитов карты / CVV)</label>
            <select id="chkPaymentMethod">
              <option value="demo_card" ${this.checkoutState.paymentMethod === "demo_card" ? "selected" : ""}>💳 Демо-карта банка (имитация шлюза)</option>
              <option value="demo_wallet" ${this.checkoutState.paymentMethod === "demo_wallet" ? "selected" : ""}>📱 Демо-кошелёк / QR (имитация шлюза)</option>
              <option value="cash_on_delivery" ${this.checkoutState.paymentMethod === "cash_on_delivery" ? "selected" : ""}>💵 Оплата при получении</option>
            </select>
          </div>

          <div style="display: flex; gap: 10px; justify-content: space-between; margin-top: 10px;">
            <button type="button" class="secondary-btn" id="chkBackTo1Btn">← Назад</button>
            <button type="button" class="primary-btn" id="chkGoTo3Btn">Далее: проверка заказа →</button>
          </div>
        </div>
      `
          : ""
      }

      ${
        this.checkoutState.step === 3
          ? `
        <div>
          <div class="summary-box" style="margin-top: 0; margin-bottom: 16px;">
            <div style="font-size: 13px; margin-bottom: 8px;">
              <b>Получатель:</b> ${escapeHtml(this.checkoutState.name)} (${escapeHtml(this.checkoutState.phone)})<br>
              <b>Адрес:</b> ${escapeHtml(this.checkoutState.address)}
            </div>
            <hr style="border: none; border-top: 1px solid var(--border); margin: 10px 0;">
            ${calc.detailedItems
              .map(
                (it) => `
              <div class="summary-line" style="font-size: 13px;">
                <span>${escapeHtml(it.name)} (${escapeHtml(it.size)}, ${escapeHtml(it.color)}) × ${it.quantity}</span>
                <span>${money(it.lineTotal, calc.currency)}</span>
              </div>
            `
              )
              .join("")}
            ${
              calc.promoDiscount > 0
                ? `<div class="summary-line" style="color: var(--success);"><span>Скидка (${escapeHtml(calc.appliedPromo.code)}):</span><span>−${money(calc.promoDiscount, calc.currency)}</span></div>`
                : ""
            }
            <div class="summary-line"><span>Доставка:</span><span>${calc.shippingCost === 0 ? "Бесплатно" : money(calc.shippingCost, calc.currency)}</span></div>
            <div class="summary-line total-line"><span>Итого к оплате:</span><span>${money(calc.total, calc.currency)}</span></div>
          </div>

          <div style="display: flex; gap: 10px; justify-content: space-between;">
            <button type="button" class="secondary-btn" id="chkBackTo2Btn">← Назад</button>
            <button type="button" class="primary-btn" id="confirmCreateOrderBtn" ${this.checkoutState.isSubmitting ? "disabled" : ""}>
              ${this.checkoutState.paymentMethod === "cash_on_delivery" ? "Подтвердить заказ" : "Перейти к демо-оплате →"}
            </button>
          </div>
        </div>
      `
          : ""
      }
    `;

    box.querySelector("#checkoutStep1Form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.checkoutState.name = box.querySelector("#chkName").value.trim();
      this.checkoutState.phone = box.querySelector("#chkPhone").value.trim();
      this.checkoutState.email = box.querySelector("#chkEmail").value.trim();
      this.checkoutState.address = box.querySelector("#chkAddress").value.trim();
      this.checkoutState.comment = box.querySelector("#chkComment").value.trim();
      this.checkoutState.step = 2;
      this.renderCheckoutModal();
    });

    box.querySelector("#chkBackTo1Btn")?.addEventListener("click", () => {
      this.checkoutState.step = 1;
      this.renderCheckoutModal();
    });

    box.querySelector("#chkGoTo3Btn")?.addEventListener("click", () => {
      this.checkoutState.deliveryMethod = box.querySelector("#chkDeliveryMethod").value;
      this.checkoutState.paymentMethod = box.querySelector("#chkPaymentMethod").value;
      this.checkoutState.step = 3;
      this.renderCheckoutModal();
    });

    box.querySelector("#chkBackTo2Btn")?.addEventListener("click", () => {
      this.checkoutState.step = 2;
      this.renderCheckoutModal();
    });

    box.querySelector("#confirmCreateOrderBtn")?.addEventListener("click", async () => {
      if (this.checkoutState.isSubmitting) return;
      this.checkoutState.isSubmitting = true;
      this.renderCheckoutModal();

      try {
        const user = dbService.getCurrentUser();
        const order = await dbService.createOrderWithTransaction({
          idempotencyKey: this.checkoutState.idempotencyKey,
          uid: user ? user.uid : null,
          customer: {
            name: this.checkoutState.name,
            phone: this.checkoutState.phone,
            email: this.checkoutState.email,
            address: this.checkoutState.address,
            comment: this.checkoutState.comment
          },
          deliveryMethod: this.checkoutState.deliveryMethod,
          paymentMethod: this.checkoutState.paymentMethod,
          cartItems: this.cart.items,
          promoCodeStr: this.cart.promoCode
        });

        // Очищаем корзину после успешного резервирования заказа
        this.cart = { items: [], promoCode: null };
        this.persistCart();
        await this.refreshAllData();

        document.getElementById("checkoutModal")?.classList.remove("active");

        if (order.paymentMethod === "cash_on_delivery") {
          this.toast(`Заказ ${order.id} успешно оформлен!`);
          this.openAccountModal("orders");
        } else {
          this.openBankSimulationModal(order);
        }
      } catch (err) {
        this.toast(err.message);
      } finally {
        this.checkoutState.isSubmitting = false;
      }
    });
  }

  /* ==========================================
     СИМУЛЯТОР БАНКОВСКОЙ ОПЛАТЫ (5 СЦЕНАРИЕВ)
     ========================================== */

  openBankSimulationModal(order) {
    this.activePaymentOrder = order;
    this.renderBankSimulationModal();
    document.getElementById("bankPaymentModal")?.classList.add("active");
  }

  renderBankSimulationModal(lastResult = null) {
    const box = document.getElementById("bankPaymentModalContent");
    const order = this.activePaymentOrder;
    if (!box || !order) return;

    const pSnap = order.pricingSnapshot || {};

    box.innerHTML = `
      <div style="border-bottom: 1px solid var(--border); padding-bottom: 14px; margin-bottom: 16px;">
        <span class="status-pill demo">ДЕМОНСТРАЦИОННАЯ СИМУЛЯЦИЯ · НАСТОЯЩИЕ ДЕНЬГИ НЕ СПИСЫВАЮТСЯ</span>
        <h2 style="font-family: var(--font-serif); font-size: 28px; margin-top: 10px;">Шлюз оплаты VESTA Pay (Demo)</h2>
        <p style="font-size: 13px; color: var(--text-muted);">
          В целях безопасности мы <b>не запрашиваем и не храним</b> реальные номера карт, CVV или пароли от банка.
        </p>
      </div>

      <div class="summary-box" style="margin-top: 0; margin-bottom: 16px;">
        <div class="summary-line"><span>Номер заказа:</span><b>${escapeHtml(order.id)}</b></div>
        <div class="summary-line"><span>Способ оплаты:</span><b>${order.paymentMethod === "demo_wallet" ? "Демо-кошелёк / QR" : "Демо-карта **** 4242"}</b></div>
        <div class="summary-line total-line"><span>Сумма к авторизации:</span><span>${money(pSnap.total, pSnap.currency)}</span></div>
      </div>

      <div class="form-field" style="margin-bottom: 16px; padding: 12px; border: 1px dashed var(--border); border-radius: var(--radius-sm);">
        <label>🧪 Переключатель сценария симуляции (для тестирования всех 5 исходов):</label>
        <select id="modalSimScenarioSelect">
          <option value="paid" ${this.simulationScenario === "paid" ? "selected" : ""}>1. Оплата успешна (paid) — заказ переходит к обработке</option>
          <option value="insufficient_funds" ${this.simulationScenario === "insufficient_funds" ? "selected" : ""}>2. Недостаточно средств (insufficient_funds) — можно повторить</option>
          <option value="declined" ${this.simulationScenario === "declined" ? "selected" : ""}>3. Банк отклонил операцию (declined) — понятная причина</option>
          <option value="error" ${this.simulationScenario === "error" ? "selected" : ""}>4. Ошибка соединения (error) — безопасный повтор</option>
          <option value="pending" ${this.simulationScenario === "pending" ? "selected" : ""}>5. Проверка платежа (pending) — ожидание подтверждения</option>
        </select>
      </div>

      ${
        lastResult
          ? `
        <div style="padding: 14px; border-radius: var(--radius-sm); margin-bottom: 16px; background: ${
          lastResult.status === "paid" ? "rgba(46,163,102,0.14)" : "rgba(201,59,59,0.12)"
        }; border: 1px solid ${lastResult.status === "paid" ? "var(--success)" : "var(--sale)"};">
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">
            Результат транзакции ${escapeHtml(lastResult.id)}: <code>${escapeHtml(lastResult.status)}</code>
          </div>
          <p style="font-size: 13px;">${escapeHtml(lastResult.message)}</p>
        </div>
      `
          : ""
      }

      <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
        <button class="secondary-btn" id="payLaterOrdersBtn">Перейти в мои заказы</button>
        ${
          order.paymentStatus !== "paid"
            ? `<button class="primary-btn" id="executeSimulatedPaymentBtn">💳 Оплатить ${money(pSnap.total, pSnap.currency)}</button>`
            : `<button class="primary-btn" id="finishPaidOrderBtn">Готово · Отследить доставку →</button>`
        }
      </div>
    `;

    box.querySelector("#modalSimScenarioSelect")?.addEventListener("change", (e) => {
      this.simulationScenario = e.target.value;
      localStorage.setItem("vesta_sim_scenario", this.simulationScenario);
      const topSelect = document.getElementById("devSimScenarioSelect");
      if (topSelect) topSelect.value = this.simulationScenario;
    });

    box.querySelector("#executeSimulatedPaymentBtn")?.addEventListener("click", async () => {
      try {
        const res = await dbService.processSimulatedPayment({
          orderId: order.id,
          scenario: this.simulationScenario,
          paymentMethod: order.paymentMethod,
          idempotencyKey: "pay_attempt_" + Date.now()
        });
        this.activePaymentOrder = res.order;
        this.renderBankSimulationModal(res.payment);
        this.toast(`Статус платежа: ${res.payment.status}`);
      } catch (err) {
        this.toast(err.message);
      }
    });

    const closeAndOpenOrders = () => {
      document.getElementById("bankPaymentModal")?.classList.remove("active");
      this.openAccountModal("orders");
    };

    box.querySelector("#payLaterOrdersBtn")?.addEventListener("click", closeAndOpenOrders);
    box.querySelector("#finishPaidOrderBtn")?.addEventListener("click", closeAndOpenOrders);
  }

  /* ==========================================
     ЛИЧНЫЙ КАБИНЕТ ПОКУПАТЕЛЯ, ИСТОРИЯ ЗАКАЗОВ И TIMELINE ДОСТАВКИ
     ========================================== */

  openAccountModal(section = "profile") {
    const user = dbService.getCurrentUser();
    if (!user) {
      this.openAuthModal();
      return;
    }
    this.accountSection = section;
    this.renderAccountModal();
    document.getElementById("accountModal")?.classList.add("active");
  }

  renderAccountModal() {
    const user = dbService.getCurrentUser();
    const box = document.getElementById("accountContentBox");
    if (!user || !box) return;

    const myOrders = dbService.getOrdersForBuyer(user.uid);

    if (this.accountSection === "profile") {
      box.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3>Мой профиль</h3>
          <span class="badge-tag new">Роль: ${escapeHtml(user.role)}</span>
        </div>
        <form id="buyerProfileForm" class="form-grid">
          <div class="form-field">
            <label>Имя и фамилия</label>
            <input type="text" id="profName" value="${escapeHtml(user.name)}" required>
          </div>
          <div class="form-field">
            <label>Email (логин аккаунта)</label>
            <input type="email" value="${escapeHtml(user.email)}" disabled>
          </div>
          <div class="form-field">
            <label>Телефон</label>
            <input type="tel" id="profPhone" value="${escapeHtml(user.phone || "")}">
          </div>
          <div class="form-field">
            <label>Сохранённые адреса доставки (по одному на строку)</label>
            <textarea id="profAddresses" rows="3">${escapeHtml((user.addresses || []).join("\n"))}</textarea>
          </div>
          <div style="display: flex; gap: 10px; justify-content: space-between;">
            <button type="submit" class="primary-btn">Сохранить изменения в Firestore</button>
            <button type="button" class="secondary-btn" id="logoutUserBtn" style="color: var(--sale);">Выйти из аккаунта</button>
          </div>
        </form>
      `;

      box.querySelector("#buyerProfileForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const addresses = box
          .querySelector("#profAddresses")
          .value.split("\n")
          .map((a) => a.trim())
          .filter(Boolean);
        await dbService.updateUserProfile(user.uid, {
          name: box.querySelector("#profName").value.trim(),
          phone: box.querySelector("#profPhone").value.trim(),
          addresses
        });
        this.toast("Профиль сохранён");
        this.renderAccountModal();
      });

      box.querySelector("#logoutUserBtn")?.addEventListener("click", async () => {
        await dbService.logout();
        document.getElementById("accountModal")?.classList.remove("active");
        this.toast("Вы вышли из аккаунта");
      });
      return;
    }

    if (this.accountSection === "orders" || this.accountSection === "tracking") {
      box.innerHTML = `
        <h3 style="margin-bottom: 16px;">Мои заказы и временная шкала доставки (${myOrders.length})</h3>
        ${
          myOrders.length === 0
            ? `<p style="color: var(--text-muted); font-size: 14px;">У вас пока нет оформленных заказов.</p>`
            : `<div style="display: flex; flex-direction: column; gap: 18px;">
                ${myOrders.map((order) => this.renderBuyerOrderCardHtml(order)).join("")}
              </div>`
        }
      `;

      box.querySelectorAll(".retry-order-pay-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const ord = myOrders.find((o) => o.id === btn.dataset.id);
          if (!ord) return;
          document.getElementById("accountModal")?.classList.remove("active");
          this.openBankSimulationModal(ord);
        });
      });

      box.querySelectorAll(".buyer-cancel-order-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const orderId = btn.dataset.id;
          if (!confirm(`Вы уверены, что хотите отменить заказ ${orderId}?`)) return;
          try {
            dbService.cancelOrder({
              orderId,
              reason: "Отменён покупателем из личного кабинета",
              actorRole: "buyer"
            });
            this.toast(`Заказ ${orderId} отменён`);
            this.refreshAllData();
            this.renderAccountModal();
          } catch (err) {
            this.toast(err.message);
          }
        });
      });
    }
  }

  renderBuyerOrderCardHtml(order) {
    const pSnap = order.pricingSnapshot || {};
    const canCancel = ["created", "awaiting_payment", "paid", "accepted"].includes(order.orderStatus);
    const canPay =
      order.paymentStatus !== "paid" &&
      order.paymentMethod !== "cash_on_delivery" &&
      order.orderStatus !== "cancelled";

    return `
      <div style="border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px; background: var(--bg);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
          <div>
            <b style="font-size: 17px;">Заказ ${escapeHtml(order.id)}</b>
            <div style="font-size: 12px; color: var(--text-muted);">
              Оформлен: ${new Date(order.createdAt).toLocaleString("ru-RU")} · Ожидаемая доставка: <b>${escapeHtml(order.expectedDeliveryDate)}</b>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Демо трек-номер: <code>${escapeHtml(order.demoTrackingNumber)}</code> <i>(демонстрационный трекинг без GPS-геолокации курьера)</i>
            </div>
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <span class="badge-tag new">Статус: ${escapeHtml(order.orderStatus)}</span>
            <span class="badge-tag ${order.paymentStatus === "paid" ? "new" : "low-stock"}">Оплата: ${escapeHtml(order.paymentStatus)}</span>
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          ${order.items
            .map(
              (it) => `
            <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0;">
              <span>${escapeHtml(it.name)} (Размер: <b>${escapeHtml(it.size)}</b>, Цвет: <b>${escapeHtml(it.color)}</b>) × ${it.quantity}</span>
              <b>${money(it.lineTotal, pSnap.currency)}</b>
            </div>
          `
            )
            .join("")}
          <div style="border-top: 1px solid var(--border); margin-top: 8px; padding-top: 8px; display: flex; justify-content: space-between; font-weight: 700;">
            <span>Итого по снимку заказа:</span>
            <span>${money(pSnap.total, pSnap.currency)}</span>
          </div>
        </div>

        <details open>
          <summary style="cursor: pointer; font-size: 13px; font-weight: 600;">📦 Временная шкала заказа и доставки (${(order.statusHistory || []).length} событий)</summary>
          <div class="timeline">
            ${(order.statusHistory || [])
              .map(
                (ev) => `
              <div class="timeline-item">
                <div class="timeline-header">
                  <span>${escapeHtml(ev.title)}</span>
                  <span class="timeline-time">${new Date(ev.timestamp).toLocaleString("ru-RU")}</span>
                </div>
                <div class="timeline-desc">${escapeHtml(ev.description)} · <i>Инициатор: ${escapeHtml(ev.actor)}</i></div>
                ${ev.comment ? `<div class="timeline-comment">Комментарий: ${escapeHtml(ev.comment)}</div>` : ""}
              </div>
            `
              )
              .join("")}
          </div>
        </details>

        <div style="display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap;">
          ${canPay ? `<button class="primary-btn retry-order-pay-btn" data-id="${escapeHtml(order.id)}" style="padding: 8px 16px; font-size: 12px;">💳 Оплатить / Повторить попытку</button>` : ""}
          ${canCancel ? `<button class="secondary-btn buyer-cancel-order-btn" data-id="${escapeHtml(order.id)}" style="padding: 8px 16px; font-size: 12px; color: var(--sale);">Отменить заказ</button>` : ""}
        </div>
      </div>
    `;
  }

  /* ==========================================
     АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ (MODAL)
     ========================================== */

  openAuthModal(preset = null) {
    const modal = document.getElementById("authModal");
    const box = document.getElementById("authModalContent");
    if (!modal || !box) return;

    let mode = "login"; // login | register | reset

    const render = () => {
      box.innerHTML = `
        <h2 style="font-family: var(--font-serif); font-size: 30px; margin-bottom: 8px;">
          ${mode === "login" ? "Вход в VESTA" : mode === "register" ? "Создание аккаунта" : "Восстановление пароля"}
        </h2>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
          Корзина, избранное и история заказов сохраняются за вашим профилем.
        </p>

        <div class="summary-box" style="margin-top: 0; margin-bottom: 16px; font-size: 12px;">
          <b>Быстрый вход для проверки ролей в демо-режиме:</b>
          <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
            <button type="button" class="secondary-btn" id="fillDemoBuyerBtn" style="padding: 6px 12px; font-size: 12px;">👤 Заполнить Покупателя</button>
            <button type="button" class="secondary-btn" id="fillDemoSellerBtn" style="padding: 6px 12px; font-size: 12px;">🔑 Заполнить Продавца (/seller)</button>
          </div>
        </div>

        <form id="authActionForm" class="form-grid">
          ${
            mode === "register"
              ? `
            <div class="form-field">
              <label>Ваше имя *</label>
              <input type="text" id="authName" required placeholder="Анна Каримова">
            </div>
            <div class="form-field">
              <label>Телефон *</label>
              <input type="tel" id="authPhone" required placeholder="+7 700 000 00 00">
            </div>
          `
              : ""
          }
          <div class="form-field">
            <label>Email *</label>
            <input type="email" id="authEmail" required value="${preset === "seller" ? "seller@vesta.kz" : ""}" placeholder="name@example.com">
          </div>
          ${
            mode !== "reset"
              ? `
            <div class="form-field">
              <label>Пароль *</label>
              <input type="password" id="authPassword" required value="${preset === "seller" ? "seller123" : ""}" placeholder="Минимум 6 символов">
            </div>
          `
              : ""
          }
          <button type="submit" class="primary-btn" style="width: 100%;">
            ${mode === "login" ? "Войти в аккаунт" : mode === "register" ? "Зарегистрироваться" : "Отправить инструкцию"}
          </button>
        </form>

        <div style="display: flex; justify-content: space-between; margin-top: 14px; font-size: 13px;">
          <button type="button" id="switchAuthModeBtn" style="background:none;border:none;text-decoration:underline;">
            ${mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
          </button>
          ${
            mode === "login"
              ? `<button type="button" id="switchResetModeBtn" style="background:none;border:none;color:var(--text-muted);">Забыли пароль?</button>`
              : ""
          }
        </div>
      `;

      box.querySelector("#fillDemoBuyerBtn")?.addEventListener("click", () => {
        mode = "login";
        render();
        box.querySelector("#authEmail").value = "buyer@vesta.kz";
        box.querySelector("#authPassword").value = "buyer123";
      });

      box.querySelector("#fillDemoSellerBtn")?.addEventListener("click", () => {
        mode = "login";
        render();
        box.querySelector("#authEmail").value = "seller@vesta.kz";
        box.querySelector("#authPassword").value = "seller123";
      });

      box.querySelector("#switchAuthModeBtn")?.addEventListener("click", () => {
        mode = mode === "login" ? "register" : "login";
        render();
      });

      box.querySelector("#switchResetModeBtn")?.addEventListener("click", () => {
        mode = "reset";
        render();
      });

      box.querySelector("#authActionForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          if (mode === "login") {
            const u = await dbService.login({
              email: box.querySelector("#authEmail").value,
              password: box.querySelector("#authPassword").value
            });
            modal.classList.remove("active");
            this.toast(`Добро пожаловать, ${u.name || u.email}!`);
          } else if (mode === "register") {
            const u = await dbService.register({
              name: box.querySelector("#authName").value,
              phone: box.querySelector("#authPhone").value,
              email: box.querySelector("#authEmail").value,
              password: box.querySelector("#authPassword").value
            });
            modal.classList.remove("active");
            this.toast(`Аккаунт ${u.name} успешно создан!`);
          } else {
            const res = await dbService.resetPassword(box.querySelector("#authEmail").value);
            this.toast(
              res.mode === "cloud"
                ? "Письмо для сброса пароля отправлено через Firebase Auth"
                : "Запрос проверен (в демо-режиме внешняя отправка email не подключена)"
            );
            mode = "login";
            render();
          }
        } catch (err) {
          this.toast(err.message);
        }
      });
    };

    render();
    modal.classList.add("active");
  }

  /* ==========================================
     ИЗБРАННОЕ, СРАВНЕНИЕ И НЕДАВНО ПРОСМОТРЕННЫЕ
     ========================================== */

  toggleFavorite(productId) {
    const exists = this.favorites.some((id) => String(id) === String(productId));
    if (exists) {
      this.favorites = this.favorites.filter((id) => String(id) !== String(productId));
      this.toast("Удалено из избранного");
    } else {
      this.favorites.push(productId);
      this.toast("Добавлено в избранное ❤️");
    }
    const uid = dbService.getCurrentUser()?.uid || null;
    dbService.saveFavorites(uid, this.favorites);
    this.updateHeaderCounters();
    this.renderCatalog();
    this.renderCuratedSections();
  }

  openFavoritesModal() {
    const box = document.getElementById("favoritesGridBox");
    const list = this.products.filter((p) => this.favorites.some((id) => String(id) === String(p.id)));
    if (box) {
      box.innerHTML = list.length
        ? list.map((p) => this.renderProductCardHtml(p)).join("")
        : `<p style="grid-column: 1 / -1; color: var(--text-muted);">В избранном пока нет сохранённых моделей.</p>`;
      this.bindProductCardsEvents(box);
    }
    document.getElementById("favoritesModal")?.classList.add("active");
  }

  toggleCompare(productId) {
    const exists = this.compareIds.some((id) => String(id) === String(productId));
    if (exists) {
      this.compareIds = this.compareIds.filter((id) => String(id) !== String(productId));
      this.toast("Модель убрана из сравнения");
    } else {
      if (this.compareIds.length >= 4) {
        this.toast("Можно сравнивать до 4 моделей одновременно");
        return;
      }
      this.compareIds.push(productId);
      this.toast("Добавлено к сравнению ⇄");
    }
    localStorage.setItem("vesta_compare_ids", JSON.stringify(this.compareIds));
    this.updateHeaderCounters();
    this.renderCatalog();
  }

  openCompareModal() {
    const box = document.getElementById("compareModalContent");
    const items = this.products.filter((p) => this.compareIds.some((id) => String(id) === String(p.id)));
    if (box) {
      if (!items.length) {
        box.innerHTML = `<p style="color: var(--text-muted);">Добавьте модели к сравнению с помощью кнопки ⇄ на карточке товара.</p>`;
      } else {
        box.innerHTML = `
          <div style="overflow-x: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Параметр</th>
                  ${items.map((p) => `<th>${escapeHtml(p.name)}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Бренд</b></td>
                  ${items.map((p) => `<td>${escapeHtml(p.brand)}</td>`).join("")}
                </tr>
                <tr>
                  <td><b>Цена</b></td>
                  ${items.map((p) => `<td><b>${money(p.price)}</b></td>`).join("")}
                </tr>
                <tr>
                  <td><b>Рейтинг</b></td>
                  ${items.map((p) => `<td>★ ${p.rating} (${p.reviewsCount || 0})</td>`).join("")}
                </tr>
                <tr>
                  <td><b>Размеры</b></td>
                  ${items.map((p) => `<td>${escapeHtml((p.sizes || []).join(", "))}</td>`).join("")}
                </tr>
                <tr>
                  <td><b>Состав ткани</b></td>
                  ${items.map((p) => `<td>${escapeHtml(p.fabric || "Базовый текстиль")}</td>`).join("")}
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }
    }
    document.getElementById("compareModal")?.classList.add("active");
  }

  renderRecentlyViewed() {
    const section = document.getElementById("recentlyViewedSection");
    const grid = document.getElementById("recentlyViewedGrid");
    if (!section || !grid) return;

    const list = this.recentlyViewedIds
      .map((id) => this.products.find((p) => String(p.id) === String(id)))
      .filter((p) => p && !p.archived)
      .slice(0, 4);

    if (!list.length) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    grid.innerHTML = list.map((p) => this.renderProductCardHtml(p)).join("");
    this.bindProductCardsEvents(grid);
  }

  /* ==========================================
     ИНФОРМАЦИОННЫЕ И ПРАВОВЫЕ СТРАНИЦЫ (ДОСТАВКА, ОПЛАТА, ВОЗВРАТ, FAQ, ПОЛИТИКИ)
     ========================================== */

  openInfoPageModal(pageKey) {
    const settings = dbService.getStoreSettings();
    const box = document.getElementById("infoModalContent");
    if (!box) return;

    const pages = {
      delivery: {
        title: "Доставка и отслеживание заказов",
        html: `
          <p>Мы доставляем заказы VESTA курьерской службой до двери, в пункты выдачи и предоставляем бесплатный самовывоз из флагманского бутика.</p>
          <ul style="margin: 12px 0 12px 20px; line-height: 1.8;">
            <li>Курьерская доставка с примеркой: <b>${money(settings.courierFee)}</b></li>
            <li>Пункты выдачи заказов: <b>${money(settings.pickupFee)}</b></li>
            <li>Бесплатная доставка при заказе от: <b>${money(settings.freeShippingThreshold)}</b></li>
          </ul>
          <p style="font-size: 13px; color: var(--text-muted);">Каждому заказу присваивается трек-номер и подробная 12-этапная шкала статусов в личном кабинете.</p>
        `
      },
      payment: {
        title: "Способы оплаты и безопасность",
        html: `
          <p>В магазине доступны оплата картой, быстрая оплата по QR/кошельку и оплата при получении после примерки.</p>
          <p style="margin-top: 10px;">В демонстрационном режиме работает безопасный симулятор банковского шлюза без сбора реальных платёжных реквизитов. В продакшн-режиме статус <code>paid</code> устанавливается исключительно серверным webhook-обработчиком.</p>
        `
      },
      returns: {
        title: "Условия обмена и возврата",
        html: `<p style="line-height: 1.7;">${escapeHtml(settings.returnPolicyText)}</p><p style="margin-top:10px;font-size:13px;color:var(--text-muted);">Срок возврата: ${settings.returnDays} дней. Этот текст редактируется продавцом в панели <code>/seller</code> → Настройки.</p>`
      },
      faq: {
        title: "Частые вопросы (FAQ)",
        html: `
          <div style="display: grid; gap: 12px;">
            <div><b>Как подобрать точный размер?</b><br><span style="color:var(--text-muted);font-size:13px;">В каждой карточке товара открывается размерная сетка с обмерами груди, талии и бёдер.</span></div>
            <div><b>Можно ли отменить оформленный заказ?</b><br><span style="color:var(--text-muted);font-size:13px;">Да, вы можете самостоятельно отменить заказ в личном кабинете, пока он не передан на сборку и курьеру. Зарезервированный товар автоматически вернётся в каталог.</span></div>
            <div><b>Сохраняется ли корзина при выходе?</b><br><span style="color:var(--text-muted);font-size:13px;">Да, все выбранные товары, их размеры и цвета привязаны к вашему аккаунту.</span></div>
          </div>
        `
      },
      privacy: {
        title: "Политика конфиденциальности и пользовательское соглашение",
        html: `<p style="line-height: 1.7;">${escapeHtml(settings.privacyPolicyText)}</p>`
      }
    };

    const page = pages[pageKey] || pages.delivery;
    box.innerHTML = `
      <h2 style="font-family: var(--font-serif); font-size: 30px; margin-bottom: 14px;">${escapeHtml(page.title)}</h2>
      <div style="font-size: 14px;">${page.html}</div>
    `;
    document.getElementById("infoModal")?.classList.add("active");
  }

  renderFooterContacts() {
    const s = dbService.getStoreSettings();
    const phoneEl = document.getElementById("footerSupportPhone");
    const emailEl = document.getElementById("footerSupportEmail");
    const instaEl = document.getElementById("footerInsta");
    if (phoneEl) phoneEl.textContent = s.supportPhone;
    if (emailEl) emailEl.textContent = s.supportEmail;
    if (instaEl) instaEl.textContent = s.instagram;
  }

  resetAllFilters() {
    this.filters = {
      search: "",
      category: "all",
      collectionTag: "all",
      size: "all",
      color: "all",
      brand: "all",
      season: "all",
      maxPrice: 100000,
      onlyInStock: false,
      sort: "new"
    };
    const ids = [
      ["searchInput", ""],
      ["categoryFilter", "all"],
      ["sizeFilter", "all"],
      ["colorFilter", "all"],
      ["brandFilter", "all"],
      ["seasonFilter", "all"],
      ["sortFilter", "new"],
      ["priceRangeFilter", "100000"]
    ];
    ids.forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    });
    const stockChk = document.getElementById("inStockFilter");
    if (stockChk) stockChk.checked = false;
    const priceLabel = document.getElementById("priceRangeValue");
    if (priceLabel) priceLabel.textContent = "до 100 000 ₸";
    this.renderCatalog();
  }

  toast(message) {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const el = document.createElement("div");
    el.className = "toast-msg";
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3200);
  }

  /* ==========================================
     ПРИВЯЗКА СТАТИЧЕСКИХ СОБЫТИЙ DOM
     ========================================== */

  bindStaticEvents() {
    document.getElementById("logoHomeBtn")?.addEventListener("click", () => {
      window.location.hash = "#/";
      this.resetAllFilters();
    });

    const searchInput = document.getElementById("searchInput");
    searchInput?.addEventListener("input", (e) => {
      this.filters.search = e.target.value;
      this.renderSearchSuggestions(e.target.value);
      this.renderCatalog();
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-wrap")) {
        document.getElementById("searchSuggestions")?.classList.remove("active");
      }
    });

    document.getElementById("headerFavBtn")?.addEventListener("click", () => this.openFavoritesModal());
    document.getElementById("headerCompareBtn")?.addEventListener("click", () => this.openCompareModal());
    document.getElementById("headerCartBtn")?.addEventListener("click", () => this.openCartModal());
    document.getElementById("headerAccountBtn")?.addEventListener("click", () => this.openAccountModal("profile"));
    document.getElementById("headerThemeBtn")?.addEventListener("click", () => this.toggleTheme());
    document.getElementById("headerSellerBtn")?.addEventListener("click", () => {
      window.location.hash = "#/seller";
    });
    document.getElementById("devOpenSellerBtn")?.addEventListener("click", () => {
      window.location.hash = "#/seller";
    });

    // Навигация по категориям в шапке
    document.querySelectorAll(".top-nav-cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.dataset.cat || "all";
        const tag = btn.dataset.tag || "all";
        this.setCategoryFilter(cat, tag);
      });
    });

    // Кнопки на главном баннере
    document.getElementById("heroExploreBtn")?.addEventListener("click", () => {
      document.getElementById("catalogSection")?.scrollIntoView({ behavior: "smooth" });
    });
    document.getElementById("heroLookbookBtn")?.addEventListener("click", () => {
      document.getElementById("lookbookSection")?.scrollIntoView({ behavior: "smooth" });
    });

    // Переключатель секций «Новинки / Хиты / Скидки»
    document.querySelectorAll(".curated-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".curated-tab-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        const grid = document.getElementById("curatedHighlightsGrid");
        if (grid) {
          grid.dataset.tab = btn.dataset.tab;
          this.renderCuratedSections();
        }
      });
    });

    // Фильтры каталога
    document.getElementById("categoryFilter")?.addEventListener("change", (e) => {
      this.filters.category = e.target.value;
      this.renderCatalog();
    });
    document.getElementById("sizeFilter")?.addEventListener("change", (e) => {
      this.filters.size = e.target.value;
      this.renderCatalog();
    });
    document.getElementById("colorFilter")?.addEventListener("change", (e) => {
      this.filters.color = e.target.value;
      this.renderCatalog();
    });
    document.getElementById("brandFilter")?.addEventListener("change", (e) => {
      this.filters.brand = e.target.value;
      this.renderCatalog();
    });
    document.getElementById("seasonFilter")?.addEventListener("change", (e) => {
      this.filters.season = e.target.value;
      this.renderCatalog();
    });
    document.getElementById("sortFilter")?.addEventListener("change", (e) => {
      this.filters.sort = e.target.value;
      this.renderCatalog();
    });
    document.getElementById("priceRangeFilter")?.addEventListener("input", (e) => {
      this.filters.maxPrice = Number(e.target.value);
      const label = document.getElementById("priceRangeValue");
      if (label) label.textContent = `до ${Number(e.target.value).toLocaleString("ru-RU")} ₸`;
      this.renderCatalog();
    });
    document.getElementById("inStockFilter")?.addEventListener("change", (e) => {
      this.filters.onlyInStock = e.target.checked;
      this.renderCatalog();
    });
    document.getElementById("resetFiltersBtn")?.addEventListener("click", () => this.resetAllFilters());

    // Меню внутри Личного кабинета
    document.querySelectorAll(".acc-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sec = btn.dataset.sec;
        if (sec === "favorites") {
          document.getElementById("accountModal")?.classList.remove("active");
          this.openFavoritesModal();
          return;
        }
        this.accountSection = sec;
        this.renderAccountModal();
      });
    });

    // Закрытие всех модальных окон
    document.querySelectorAll(".modal-close-trigger").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.closest(".modal")?.classList.remove("active");
      });
    });

    document.querySelectorAll(".modal").forEach((m) => {
      m.addEventListener("click", (e) => {
        if (e.target === m) m.classList.remove("active");
      });
    });

    // Ссылки на информационные страницы в футере
    document.querySelectorAll(".info-page-trigger").forEach((btn) => {
      btn.addEventListener("click", () => this.openInfoPageModal(btn.dataset.page));
    });

    // Мобильная нижняя навигация
    document.getElementById("mobNavHome")?.addEventListener("click", () => {
      window.location.hash = "#/";
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.getElementById("mobNavCatalog")?.addEventListener("click", () => {
      window.location.hash = "#/";
      document.getElementById("catalogSection")?.scrollIntoView({ behavior: "smooth" });
    });
    document.getElementById("mobNavCart")?.addEventListener("click", () => this.openCartModal());
    document.getElementById("mobNavFav")?.addEventListener("click", () => this.openFavoritesModal());
    document.getElementById("mobNavAccount")?.addEventListener("click", () => this.openAccountModal("profile"));
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new VestaStoreApp();
  app.init();
});
