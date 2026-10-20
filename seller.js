/**
 * VESTA — Защищённая панель продавца (/seller)
 * Включает: Дашборд KPI, Управление товарами и загрузку изображений (Storage),
 * Управление категориями, Заказы и логистика (12 этапов), Управление остатками,
 * Промокоды, Модерация отзывов, Журнал действий продавца и Настройки магазина.
 */

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoney(val, currency = "₸") {
  return `${Number(val || 0).toLocaleString("ru-RU")} ${currency}`;
}

export class SellerPanelController {
  constructor(dbService, toastFn, refreshBuyerCatalogFn) {
    this.db = dbService;
    this.toast = toastFn;
    this.refreshBuyerCatalog = refreshBuyerCatalogFn;
    this.activeTab = "dashboard";
    this.orderFilters = {
      search: "",
      status: "all",
      payment: "all",
      delivery: "all",
      dateFrom: ""
    };
    this.editingProductId = null;
    this.uploadedImagesBuffer = [];
  }

  renderWorkspace(container) {
    const user = this.db.getCurrentUser();
    if (!user || user.role !== "seller") {
      container.innerHTML = `
        <div class="modal-box narrow" style="margin: 40px auto; text-align: center;">
          <span class="badge-tag sale" style="margin-bottom: 12px; display: inline-block;">Доступ ограничен · 403</span>
          <h2 style="font-family: var(--font-serif); font-size: 30px; margin-bottom: 10px;">Требуются права продавца</h2>
          <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
            Панель управления <code>/seller</code> защищена проверкой роли. Обычный покупатель не может получить доступ к административным функциям, просто открыв URL или изменив код в браузере.
          </p>
          <div class="summary-box" style="text-align: left; margin-bottom: 20px; font-size: 13px;">
            <b>Как войти для проверки панели продавца:</b>
            <p style="margin-top: 6px; color: var(--text-muted);">
              1. В рабочем проекте роль <code>seller</code> назначается только через <b>Firebase Admin SDK / Cloud Functions</b>.<br>
              2. В деморежиме используйте преднастроенный аккаунт продавца:<br>
              Email: <code>seller@vesta.kz</code> · Пароль: <code>seller123</code>
            </p>
          </div>
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button class="primary-btn" id="sellerLoginRedirectBtn">Войти как продавец</button>
            <button class="secondary-btn" id="sellerBackToStoreBtn">← Вернуться в магазин</button>
          </div>
        </div>
      `;

      container.querySelector("#sellerLoginRedirectBtn")?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("vesta:open-auth", { detail: { preset: "seller" } }));
      });
      container.querySelector("#sellerBackToStoreBtn")?.addEventListener("click", () => {
        window.location.hash = "#/";
      });
      return;
    }

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
        <div>
          <span class="badge-tag new">Seller Workspace · /seller</span>
          <h1 style="font-family: var(--font-serif); font-size: 34px; margin-top: 4px;">Панель управления VESTA</h1>
          <p style="color: var(--text-muted); font-size: 13px;">Авторизован сотрудник: <b>${escapeHtml(user.name)}</b> (${escapeHtml(user.email)}) · Роль подтверждена</p>
        </div>
        <button class="secondary-btn" id="exitSellerBtn">← В витрину покупателя</button>
      </div>

      <div class="seller-layout">
        <aside class="seller-sidebar" role="navigation" aria-label="Меню продавца">
          <button class="seller-nav-btn ${this.activeTab === "dashboard" ? "active" : ""}" data-tab="dashboard">📊 Дашборд и сводка</button>
          <button class="seller-nav-btn ${this.activeTab === "orders" ? "active" : ""}" data-tab="orders">📦 Заказы и доставка</button>
          <button class="seller-nav-btn ${this.activeTab === "products" ? "active" : ""}" data-tab="products">🧥 Товары и фото</button>
          <button class="seller-nav-btn ${this.activeTab === "inventory" ? "active" : ""}" data-tab="inventory">📋 Склад и остатки</button>
          <button class="seller-nav-btn ${this.activeTab === "categories" ? "active" : ""}" data-tab="categories">🗂 Категории</button>
          <button class="seller-nav-btn ${this.activeTab === "promos" ? "active" : ""}" data-tab="promos">🏷 Промокоды</button>
          <button class="seller-nav-btn ${this.activeTab === "reviews" ? "active" : ""}" data-tab="reviews">💬 Отзывы клиентов</button>
          <button class="seller-nav-btn ${this.activeTab === "logs" ? "active" : ""}" data-tab="logs">🛡 Журнал действий</button>
          <button class="seller-nav-btn ${this.activeTab === "settings" ? "active" : ""}" data-tab="settings">⚙️ Настройки магазина</button>
        </aside>

        <section id="sellerTabContent" style="min-width: 0;"></section>
      </div>
    `;

    container.querySelector("#exitSellerBtn")?.addEventListener("click", () => {
      window.location.hash = "#/";
    });

    container.querySelectorAll(".seller-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeTab = btn.dataset.tab;
        this.renderWorkspace(container);
      });
    });

    const tabBox = container.querySelector("#sellerTabContent");
    this.renderActiveTab(tabBox);
  }

  async renderActiveTab(tabBox) {
    if (!tabBox) return;
    switch (this.activeTab) {
      case "dashboard":
        return this.renderDashboard(tabBox);
      case "orders":
        return this.renderOrders(tabBox);
      case "products":
        return this.renderProductsManager(tabBox);
      case "inventory":
        return this.renderInventoryManager(tabBox);
      case "categories":
        return this.renderCategoriesManager(tabBox);
      case "promos":
        return this.renderPromosManager(tabBox);
      case "reviews":
        return this.renderReviewsManager(tabBox);
      case "logs":
        return this.renderAuditLogs(tabBox);
      case "settings":
        return this.renderStoreSettings(tabBox);
    }
  }

  /* ==========================================
     1. ДАШБОРД ПРОДАВЦА
     ========================================== */
  async renderDashboard(box) {
    const orders = this.db.getAllOrdersForSeller();
    const products = await this.db.getProducts();
    const settings = this.db.getStoreSettings();

    const confirmedRevenue = orders
      .filter((o) => o.paymentStatus === "paid" && o.orderStatus !== "cancelled" && o.orderStatus !== "returned")
      .reduce((sum, o) => sum + (o.pricingSnapshot?.total || 0), 0);

    const pendingOrders = orders.filter((o) =>
      ["created", "awaiting_payment", "paid", "accepted", "packing"].includes(o.orderStatus)
    );

    const lowStockVariants = [];
    let totalUnitsInStock = 0;

    products.forEach((p) => {
      if (p.archived) return;
      Object.entries(p.stock || {}).forEach(([key, qty]) => {
        totalUnitsInStock += Number(qty) || 0;
        if (qty <= settings.lowStockThreshold) {
          const [size, color] = key.split("_");
          lowStockVariants.push({ product: p, size, color, qty });
        }
      });
    });

    box.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Выручка (оплачено)</div>
          <div class="kpi-value">${formatMoney(confirmedRevenue, settings.currency)}</div>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Только подтверждённые платежи</p>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Всего заказов</div>
          <div class="kpi-value">${orders.length}</div>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Ожидают обработки: <b>${pendingOrders.length}</b></p>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Товаров в каталоге</div>
          <div class="kpi-value">${products.filter((p) => !p.archived).length}</div>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Всего единиц на складе: <b>${totalUnitsInStock}</b></p>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Низкий остаток (≤ ${settings.lowStockThreshold} шт.)</div>
          <div class="kpi-value" style="color: ${lowStockVariants.length ? "var(--warning)" : "var(--success)"};">${lowStockVariants.length}</div>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Позиций требуют пополнения</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div class="feature-card">
          <h3 style="margin-bottom: 12px;">⚠️ Предупреждения о низком остатке</h3>
          ${
            lowStockVariants.length === 0
              ? `<p style="color: var(--text-muted); font-size: 13px;">Все размеры в достаточном количестве.</p>`
              : `<div style="max-height: 280px; overflow-y: auto;">
                  <table class="data-table">
                    <thead><tr><th>Товар</th><th>Вариант</th><th>Остаток</th></tr></thead>
                    <tbody>
                      ${lowStockVariants
                        .slice(0, 12)
                        .map(
                          (v) => `
                        <tr>
                          <td><b>${escapeHtml(v.product.name)}</b></td>
                          <td>${escapeHtml(v.size)} / ${escapeHtml(v.color)}</td>
                          <td><span class="badge-tag ${v.qty === 0 ? "out" : "low-stock"}">${v.qty} шт.</span></td>
                        </tr>
                      `
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>`
          }
        </div>

        <div class="feature-card">
          <h3 style="margin-bottom: 12px;">🕒 Последние заказы</h3>
          ${
            orders.length === 0
              ? `<p style="color: var(--text-muted); font-size: 13px;">Заказов пока нет.</p>`
              : `<table class="data-table">
                  <thead><tr><th>Номер</th><th>Покупатель</th><th>Сумма</th><th>Статус</th></tr></thead>
                  <tbody>
                    ${orders
                      .slice(0, 6)
                      .map(
                        (o) => `
                      <tr>
                        <td><b>${escapeHtml(o.id)}</b></td>
                        <td>${escapeHtml(o.customer?.name)}</td>
                        <td>${formatMoney(o.pricingSnapshot?.total, o.pricingSnapshot?.currency)}</td>
                        <td><span class="badge-tag new">${escapeHtml(o.orderStatus)}</span></td>
                      </tr>
                    `
                      )
                      .join("")}
                  </tbody>
                </table>`
          }
        </div>
      </div>
    `;
  }

  /* ==========================================
     2. УПРАВЛЕНИЕ ЗАКАЗАМИ И 12 ЭТАПАМИ ДОСТАВКИ
     ========================================== */
  renderOrders(box) {
    const allOrders = this.db.getAllOrdersForSeller();

    const filtered = allOrders.filter((o) => {
      const q = this.orderFilters.search.toLowerCase();
      const matchSearch =
        !q ||
        o.id.toLowerCase().includes(q) ||
        (o.customer?.name || "").toLowerCase().includes(q) ||
        (o.customer?.phone || "").toLowerCase().includes(q);
      const matchStatus = this.orderFilters.status === "all" || o.orderStatus === this.orderFilters.status;
      const matchPayment = this.orderFilters.payment === "all" || o.paymentStatus === this.orderFilters.payment;
      const matchDelivery = this.orderFilters.delivery === "all" || o.deliveryMethod === this.orderFilters.delivery;
      const matchDate = !this.orderFilters.dateFrom || o.createdAt.slice(0, 10) >= this.orderFilters.dateFrom;
      return matchSearch && matchStatus && matchPayment && matchDelivery && matchDate;
    });

    box.innerHTML = `
      <div class="filters-panel">
        <div class="filters-row">
          <input type="text" id="sellerOrderSearch" placeholder="Поиск по № заказа, имени, телефону..." value="${escapeHtml(this.orderFilters.search)}">
          <select id="sellerOrderStatusFilter">
            <option value="all">Все статусы заказа</option>
            <option value="created" ${this.orderFilters.status === "created" ? "selected" : ""}>Оформлен</option>
            <option value="awaiting_payment" ${this.orderFilters.status === "awaiting_payment" ? "selected" : ""}>Ожидает оплаты</option>
            <option value="paid" ${this.orderFilters.status === "paid" ? "selected" : ""}>Оплачен</option>
            <option value="accepted" ${this.orderFilters.status === "accepted" ? "selected" : ""}>Принят продавцом</option>
            <option value="packing" ${this.orderFilters.status === "packing" ? "selected" : ""}>Собирается</option>
            <option value="shipped" ${this.orderFilters.status === "shipped" ? "selected" : ""}>Передан курьеру</option>
            <option value="in_transit" ${this.orderFilters.status === "in_transit" ? "selected" : ""}>В пути</option>
            <option value="ready_for_pickup" ${this.orderFilters.status === "ready_for_pickup" ? "selected" : ""}>В пункте выдачи</option>
            <option value="out_for_delivery" ${this.orderFilters.status === "out_for_delivery" ? "selected" : ""}>Курьер доставляет</option>
            <option value="delivered" ${this.orderFilters.status === "delivered" ? "selected" : ""}>Доставлен</option>
            <option value="cancelled" ${this.orderFilters.status === "cancelled" ? "selected" : ""}>Отменён</option>
          </select>
          <select id="sellerPaymentFilter">
            <option value="all">Все статусы оплаты</option>
            <option value="paid" ${this.orderFilters.payment === "paid" ? "selected" : ""}>Оплачен (paid)</option>
            <option value="unpaid" ${this.orderFilters.payment === "unpaid" ? "selected" : ""}>Не оплачен</option>
            <option value="pending" ${this.orderFilters.payment === "pending" ? "selected" : ""}>На проверке</option>
            <option value="cod_pending" ${this.orderFilters.payment === "cod_pending" ? "selected" : ""}>Оплата при получении</option>
          </select>
          <input type="date" id="sellerOrderDateFilter" value="${escapeHtml(this.orderFilters.dateFrom)}">
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${
          filtered.length === 0
            ? `<div class="feature-card"><p style="color: var(--text-muted);">Заказы по заданным фильтрам не найдены.</p></div>`
            : filtered.map((order) => this._renderOrderCardForSeller(order)).join("")
        }
      </div>
    `;

    box.querySelector("#sellerOrderSearch")?.addEventListener("input", (e) => {
      this.orderFilters.search = e.target.value;
      this.renderOrders(box);
    });
    box.querySelector("#sellerOrderStatusFilter")?.addEventListener("change", (e) => {
      this.orderFilters.status = e.target.value;
      this.renderOrders(box);
    });
    box.querySelector("#sellerPaymentFilter")?.addEventListener("change", (e) => {
      this.orderFilters.payment = e.target.value;
      this.renderOrders(box);
    });
    box.querySelector("#sellerOrderDateFilter")?.addEventListener("change", (e) => {
      this.orderFilters.dateFrom = e.target.value;
      this.renderOrders(box);
    });

    box.querySelectorAll(".seller-apply-stage-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const orderId = btn.dataset.orderId;
        const selectEl = box.querySelector(`#stageSelect_${orderId}`);
        const commentEl = box.querySelector(`#stageComment_${orderId}`);
        try {
          this.db.updateOrderStageBySeller({
            orderId,
            newStage: selectEl.value,
            sellerComment: commentEl.value
          });
          this.toast(`Статус заказа ${orderId} обновлён`);
          this.renderOrders(box);
          this.refreshBuyerCatalog();
        } catch (err) {
          this.toast(err.message);
        }
      });
    });

    box.querySelectorAll(".seller-cancel-order-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const orderId = btn.dataset.orderId;
        const commentEl = box.querySelector(`#stageComment_${orderId}`);
        const reason = commentEl?.value?.trim() || prompt("Укажите причину отмены заказа (остатки будут возвращены на склад):");
        if (!reason) return;
        try {
          this.db.cancelOrder({ orderId, reason, actorRole: "seller" });
          this.toast(`Заказ ${orderId} отменён, остатки восстановлены`);
          this.renderOrders(box);
          this.refreshBuyerCatalog();
        } catch (err) {
          this.toast(err.message);
        }
      });
    });
  }

  _renderOrderCardForSeller(order) {
    const pSnap = order.pricingSnapshot || {};
    const isClosed = ["cancelled", "returned"].includes(order.orderStatus);

    return `
      <div class="feature-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 14px;">
          <div>
            <span style="font-size: 18px; font-weight: 700;">Заказ ${escapeHtml(order.id)}</span>
            <span style="font-size: 12px; color: var(--text-muted); margin-left: 10px;">от ${new Date(order.createdAt).toLocaleString("ru-RU")}</span>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
              Демо трек-номер: <code>${escapeHtml(order.demoTrackingNumber)}</code> · Способ доставки: <b>${escapeHtml(order.deliveryMethod)}</b>
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span class="badge-tag new">Статус: ${escapeHtml(order.orderStatus)}</span>
            <span class="badge-tag ${order.paymentStatus === "paid" ? "new" : "low-stock"}">Оплата: ${escapeHtml(order.paymentStatus)}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
            <h4 style="margin-bottom: 8px;">👤 Контакты покупателя и адрес (служебный доступ)</h4>
            <p style="font-size: 13px;"><b>Имя:</b> ${escapeHtml(order.customer?.name)}</p>
            <p style="font-size: 13px;"><b>Телефон:</b> ${escapeHtml(order.customer?.phone)}</p>
            <p style="font-size: 13px;"><b>Адрес:</b> ${escapeHtml(order.customer?.address)}</p>
            ${order.customer?.comment ? `<p style="font-size: 13px;"><b>Комментарий:</b> ${escapeHtml(order.customer.comment)}</p>` : ""}

            <h4 style="margin: 14px 0 8px;">🛍 Состав заказа (снимок цен на момент покупки)</h4>
            ${order.items
              .map(
                (it) => `
              <div style="font-size: 13px; padding: 6px 0; border-bottom: 1px dashed var(--border);">
                <b>${escapeHtml(it.name)}</b> — Размер: <b>${escapeHtml(it.size)}</b>, Цвет: <b>${escapeHtml(it.color)}</b> × ${it.quantity} шт. = <b>${formatMoney(it.lineTotal, pSnap.currency)}</b>
              </div>
            `
              )
              .join("")}
            <div style="margin-top: 10px; font-size: 14px;">
              Скидка по промокоду (${escapeHtml(pSnap.promoCode || "нет")}): −${formatMoney(pSnap.promoDiscount || 0, pSnap.currency)} ·
              Доставка: ${formatMoney(pSnap.shippingCost || 0, pSnap.currency)} ·
              <b>Итого: ${formatMoney(pSnap.total, pSnap.currency)}</b>
            </div>
          </div>

          <div>
            <h4 style="margin-bottom: 8px;">🚚 Управление этапами заказа и доставки</h4>
            ${
              isClosed
                ? `<p style="color: var(--sale); font-size: 13px;">Заказ закрыт (${escapeHtml(order.orderStatus)}). Причина: ${escapeHtml(order.cancelReason || "возврат")}</p>`
                : `
              <div class="form-grid">
                <select id="stageSelect_${escapeHtml(order.id)}">
                  <option value="accepted">4. Продавец принял заказ</option>
                  <option value="packing">5. Собирается и упаковывается</option>
                  <option value="shipped">6. Передан курьеру</option>
                  <option value="in_transit">7. В пути</option>
                  <option value="ready_for_pickup">8. Прибыл в пункт выдачи</option>
                  <option value="out_for_delivery">9. Курьер доставляет заказ до двери</option>
                  <option value="delivered">10. Доставлен покупателю</option>
                  <option value="return_requested">12а. Возврат оформлен</option>
                  <option value="returned">12б. Возврат завершён (вернуть остаток)</option>
                </select>
                <input type="text" id="stageComment_${escapeHtml(order.id)}" placeholder="Комментарий продавца для истории отслеживания...">
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                  <button class="primary-btn seller-apply-stage-btn" data-order-id="${escapeHtml(order.id)}">Обновить этап</button>
                  <button class="secondary-btn seller-cancel-order-btn" data-order-id="${escapeHtml(order.id)}" style="color: var(--sale); border-color: var(--sale);">Отменить заказ и вернуть остатки</button>
                </div>
              </div>
            `
            }
          </div>
        </div>
      </div>
    `;
  }

  /* ==========================================
     3. УПРАВЛЕНИЕ ТОВАРАМИ И FIREBASE STORAGE
     ========================================== */
  async renderProductsManager(box) {
    const products = await this.db.getProducts();
    const categories = await this.db.getCategories();
    const editingProduct = this.editingProductId
      ? products.find((p) => String(p.id) === String(this.editingProductId))
      : null;

    box.innerHTML = `
      <div class="feature-card" style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 14px;">${editingProduct ? `Редактирование: ${escapeHtml(editingProduct.name)}` : "➕ Добавить новый товар в каталог"}</h3>
        <form id="sellerProductForm" class="form-grid">
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
            <div class="form-field">
              <label>Название товара *</label>
              <input type="text" id="prodName" required value="${escapeHtml(editingProduct?.name || "")}">
            </div>
            <div class="form-field">
              <label>Бренд *</label>
              <input type="text" id="prodBrand" required value="${escapeHtml(editingProduct?.brand || "VESTA")}">
            </div>
            <div class="form-field">
              <label>Категория *</label>
              <select id="prodCategory">
                ${categories
                  .map(
                    (c) => `<option value="${escapeHtml(c.name)}" ${editingProduct?.category === c.name ? "selected" : ""}>${escapeHtml(c.name)}</option>`
                  )
                  .join("")}
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px;">
            <div class="form-field">
              <label>Цена (₸) *</label>
              <input type="number" id="prodPrice" min="100" required value="${editingProduct?.price || 29900}">
            </div>
            <div class="form-field">
              <label>Старая цена до скидки (₸)</label>
              <input type="number" id="prodOldPrice" value="${editingProduct?.oldPrice || ""}">
            </div>
            <div class="form-field">
              <label>Размеры (через запятую)</label>
              <input type="text" id="prodSizes" value="${escapeHtml((editingProduct?.sizes || ["S", "M", "L"]).join(", "))}">
            </div>
            <div class="form-field">
              <label>Цвета (через запятую)</label>
              <input type="text" id="prodColors" value="${escapeHtml((editingProduct?.colors || [editingProduct?.color || "Чёрный"]).join(", "))}">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-field">
              <label>URL фотографий (по одному на строку или загрузите файл ниже)</label>
              <textarea id="prodImagesUrls" rows="3" placeholder="https://images.unsplash.com/...">${escapeHtml((editingProduct?.images || []).join("\n"))}</textarea>
            </div>
            <div class="form-field">
              <label>Загрузка фото через Firebase Storage (JPG/PNG/WebP до 5 МБ)</label>
              <input type="file" id="prodImageFileInput" accept="image/jpeg,image/png,image/webp,image/avif">
              <p style="font-size: 12px; color: var(--text-muted);" id="uploadStatusText">
                Выбранное изображение автоматически загружается и добавляется в галерею товара.
              </p>
            </div>
          </div>

          <div class="form-field">
            <label>Подробное описание модели, ткани и посадки</label>
            <textarea id="prodDescription" rows="2">${escapeHtml(editingProduct?.description || "")}</textarea>
          </div>

          <div style="display: flex; gap: 18px; align-items: center; flex-wrap: wrap;">
            <label class="checkbox-label"><input type="checkbox" id="prodIsNew" ${editingProduct?.isNew ? "checked" : ""}> Новинка (New)</label>
            <label class="checkbox-label"><input type="checkbox" id="prodIsSale" ${editingProduct?.isSale ? "checked" : ""}> Распродажа (Sale)</label>
            <label class="checkbox-label"><input type="checkbox" id="prodIsBest" ${editingProduct?.isBestseller ? "checked" : ""}> Хит продаж</label>
            <div style="margin-left: auto; display: flex; gap: 10px;">
              ${editingProduct ? `<button type="button" class="secondary-btn" id="cancelEditProdBtn">Отмена</button>` : ""}
              <button type="submit" class="primary-btn">${editingProduct ? "Сохранить изменения" : "Создать товар"}</button>
            </div>
          </div>
        </form>
      </div>

      <div class="feature-card">
        <h3 style="margin-bottom: 14px;">Каталог товаров (${products.length})</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Фото</th>
              <th>Название / Бренд</th>
              <th>Категория</th>
              <th>Цена</th>
              <th>Размеры и Цвета</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${products
              .map(
                (p) => `
              <tr style="${p.archived ? "opacity: 0.5;" : ""}">
                <td><img src="${escapeHtml(p.images?.[0] || "")}" alt="" style="width: 48px; height: 60px; object-fit: cover; border-radius: 6px;"></td>
                <td><b>${escapeHtml(p.name)}</b><br><span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(p.brand)}</span></td>
                <td>${escapeHtml(p.category)}</td>
                <td><b>${formatMoney(p.price)}</b>${p.oldPrice ? `<br><s style="font-size:11px;color:var(--text-muted)">${formatMoney(p.oldPrice)}</s>` : ""}</td>
                <td>${escapeHtml((p.sizes || []).join(", "))}<br><span style="font-size:12px;color:var(--text-muted)">${escapeHtml((p.colors || []).join(", "))}</span></td>
                <td>${p.archived ? `<span class="badge-tag out">В архиве</span>` : `<span class="badge-tag new">Активен</span>`}</td>
                <td>
                  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button class="secondary-btn edit-prod-btn" data-id="${escapeHtml(p.id)}" style="padding: 6px 12px; font-size: 12px;">Изменить</button>
                    <button class="secondary-btn archive-prod-btn" data-id="${escapeHtml(p.id)}" style="padding: 6px 12px; font-size: 12px;">
                      ${p.archived ? "Восстановить" : "В архив"}
                    </button>
                  </div>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    const fileInput = box.querySelector("#prodImageFileInput");
    fileInput?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const statusEl = box.querySelector("#uploadStatusText");
      statusEl.textContent = "Загрузка и оптимизация изображения...";
      try {
        const url = await this.db.uploadProductImage(file);
        const urlsTextarea = box.querySelector("#prodImagesUrls");
        urlsTextarea.value = (urlsTextarea.value ? urlsTextarea.value.trim() + "\n" : "") + url;
        statusEl.textContent = "✅ Изображение успешно добавлено в список!";
        this.toast("Изображение загружено");
      } catch (err) {
        statusEl.textContent = "❌ " + err.message;
        this.toast(err.message);
      }
    });

    box.querySelector("#cancelEditProdBtn")?.addEventListener("click", () => {
      this.editingProductId = null;
      this.renderProductsManager(box);
    });

    box.querySelector("#sellerProductForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sizes = box
        .querySelector("#prodSizes")
        .value.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const colors = box
        .querySelector("#prodColors")
        .value.split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const images = box
        .querySelector("#prodImagesUrls")
        .value.split("\n")
        .map((u) => u.trim())
        .filter(Boolean);

      const stockMap = editingProduct?.stock ? { ...editingProduct.stock } : {};
      sizes.forEach((sz) => {
        colors.forEach((cl) => {
          const key = `${sz}_${cl}`;
          if (typeof stockMap[key] !== "number") {
            stockMap[key] = 5;
          }
        });
      });

      const payload = {
        id: editingProduct ? editingProduct.id : null,
        name: box.querySelector("#prodName").value.trim(),
        brand: box.querySelector("#prodBrand").value.trim(),
        category: box.querySelector("#prodCategory").value,
        price: Number(box.querySelector("#prodPrice").value) || 0,
        oldPrice: Number(box.querySelector("#prodOldPrice").value) || null,
        sizes: sizes.length ? sizes : ["ONE SIZE"],
        colors: colors.length ? colors : ["Чёрный"],
        images: images.length
          ? images
          : ["https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80"],
        description: box.querySelector("#prodDescription").value.trim(),
        isNew: box.querySelector("#prodIsNew").checked,
        isSale: box.querySelector("#prodIsSale").checked,
        isBestseller: box.querySelector("#prodIsBest").checked,
        stock: stockMap
      };

      try {
        await this.db.saveProduct(payload);
        this.editingProductId = null;
        this.toast("Товар успешно сохранён в каталоге");
        this.renderProductsManager(box);
        this.refreshBuyerCatalog();
      } catch (err) {
        this.toast(err.message);
      }
    });

    box.querySelectorAll(".edit-prod-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.editingProductId = btn.dataset.id;
        this.renderProductsManager(box);
      });
    });

    box.querySelectorAll(".archive-prod-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await this.db.toggleArchiveProduct(btn.dataset.id);
          this.renderProductsManager(box);
          this.refreshBuyerCatalog();
        } catch (err) {
          this.toast(err.message);
        }
      });
    });
  }

  /* ==========================================
     4. СКЛАД И ОСТАТКИ ПО РАЗМЕРАМ/ЦВЕТАМ
     ========================================== */
  async renderInventoryManager(box) {
    const products = await this.db.getProducts();
    const settings = this.db.getStoreSettings();

    box.innerHTML = `
      <div class="feature-card">
        <h3 style="margin-bottom: 8px;">Управление остатками по матрице «Размер × Цвет»</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 18px;">
          Порог предупреждения о низком остатке: <b>${settings.lowStockThreshold} шт.</b> Каждое изменение записывается в журнал действий продавца.
        </p>

        <div style="display: flex; flex-direction: column; gap: 18px;">
          ${products
            .map(
              (p) => `
            <div style="border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px;">
              <div style="font-weight: 700; margin-bottom: 10px;">${escapeHtml(p.name)} (${escapeHtml(p.brand)})</div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px;">
                ${Object.entries(p.stock || {})
                  .map(([key, qty]) => {
                    const [size, color] = key.split("_");
                    return `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; background: var(--bg); border-radius: 6px; border: 1px solid var(--border);">
                      <span style="font-size: 12px;"><b>${escapeHtml(size)}</b> · ${escapeHtml(color)}</span>
                      <div style="display: flex; align-items: center; gap: 4px;">
                        <input type="number" min="0" value="${qty}" data-prod="${escapeHtml(p.id)}" data-size="${escapeHtml(size)}" data-color="${escapeHtml(color)}" class="stock-qty-input" style="width: 60px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; text-align: center;">
                        <button class="secondary-btn save-stock-btn" data-prod="${escapeHtml(p.id)}" data-size="${escapeHtml(size)}" data-color="${escapeHtml(color)}" style="padding: 4px 8px; font-size: 11px;">ОК</button>
                      </div>
                    </div>
                  `;
                  })
                  .join("")}
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    box.querySelectorAll(".save-stock-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const prodId = btn.dataset.prod;
        const size = btn.dataset.size;
        const color = btn.dataset.color;
        const input = box.querySelector(
          `.stock-qty-input[data-prod="${prodId}"][data-size="${size}"][data-color="${color}"]`
        );
        try {
          await this.db.updateVariantStock(prodId, size, color, Number(input.value));
          this.toast(`Остаток обновлён: ${size} / ${color} → ${input.value} шт.`);
          this.refreshBuyerCatalog();
        } catch (err) {
          this.toast(err.message);
        }
      });
    });
  }

  /* ==========================================
     5. КАТЕГОРИИ
     ========================================== */
  async renderCategoriesManager(box) {
    const categories = await this.db.getCategories();
    box.innerHTML = `
      <div class="feature-card" style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 12px;">Добавить категорию</h3>
        <form id="addCategoryForm" style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 10px;">
          <input type="text" id="catName" placeholder="Название (напр. Верхняя одежда)" required style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
          <input type="text" id="catSubtitle" placeholder="Подзаголовок" style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
          <input type="url" id="catImage" placeholder="URL обложки" style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
          <button type="submit" class="primary-btn">Добавить</button>
        </form>
      </div>

      <div class="feature-card">
        <table class="data-table">
          <thead><tr><th>Обложка</th><th>Название</th><th>Описание</th><th>Действие</th></tr></thead>
          <tbody>
            ${categories
              .map(
                (c) => `
              <tr>
                <td><img src="${escapeHtml(c.image)}" alt="" style="width: 60px; height: 42px; object-fit: cover; border-radius: 6px;"></td>
                <td><b>${escapeHtml(c.name)}</b></td>
                <td>${escapeHtml(c.subtitle || "")}</td>
                <td><button class="secondary-btn del-cat-btn" data-id="${escapeHtml(c.id)}" style="padding: 5px 10px; font-size: 12px;">Удалить</button></td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    box.querySelector("#addCategoryForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = box.querySelector("#catName").value.trim();
      await this.db.saveCategory({
        name,
        slug: name,
        subtitle: box.querySelector("#catSubtitle").value.trim(),
        image:
          box.querySelector("#catImage").value.trim() ||
          "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80"
      });
      this.toast(`Категория «${name}» добавлена`);
      this.renderCategoriesManager(box);
      this.refreshBuyerCatalog();
    });

    box.querySelectorAll(".del-cat-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await this.db.deleteCategory(btn.dataset.id);
        this.renderCategoriesManager(box);
        this.refreshBuyerCatalog();
      });
    });
  }

  /* ==========================================
     6. ПРОМОКОДЫ И СКИДКИ
     ========================================== */
  renderPromosManager(box) {
    const promos = this.db.getPromoCodes();
    box.innerHTML = `
      <div class="feature-card" style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 12px;">Создать или обновить промокод</h3>
        <form id="promoForm" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
          <input type="text" id="pCode" placeholder="Код (напр. VIP20)" required style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
          <select id="pType" style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
            <option value="percent">Процент (%)</option>
            <option value="fixed">Фиксированная сумма (₸)</option>
          </select>
          <input type="number" id="pValue" placeholder="Значение скидки" required style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
          <input type="number" id="pMinOrder" placeholder="Мин. сумма заказа (₸)" value="15000" style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
          <input type="date" id="pExpires" value="2027-12-31" style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
          <button type="submit" class="primary-btn">Сохранить промокод</button>
        </form>
      </div>

      <div class="feature-card">
        <table class="data-table">
          <thead><tr><th>Код</th><th>Скидка</th><th>Мин. заказ</th><th>Использовано</th><th>Действует до</th><th>Действие</th></tr></thead>
          <tbody>
            ${promos
              .map(
                (p) => `
              <tr>
                <td><b>${escapeHtml(p.code)}</b></td>
                <td>${p.value}${p.type === "percent" ? "%" : " ₸"}</td>
                <td>${formatMoney(p.minOrderAmount)}</td>
                <td>${p.usedCount} / ${p.maxUses}</td>
                <td>${escapeHtml(p.expiresAt)}</td>
                <td><button class="secondary-btn del-promo-btn" data-id="${escapeHtml(p.id)}" style="padding: 5px 10px; font-size: 12px;">Удалить</button></td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    box.querySelector("#promoForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.db.savePromoCode({
        code: box.querySelector("#pCode").value,
        type: box.querySelector("#pType").value,
        value: Number(box.querySelector("#pValue").value),
        minOrderAmount: Number(box.querySelector("#pMinOrder").value),
        expiresAt: box.querySelector("#pExpires").value
      });
      this.toast("Промокод сохранён");
      this.renderPromosManager(box);
    });

    box.querySelectorAll(".del-promo-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.db.deletePromoCode(btn.dataset.id);
        this.renderPromosManager(box);
      });
    });
  }

  /* ==========================================
     7. ОТЗЫВЫ И ОТВЕТЫ ПРОДАВЦА
     ========================================== */
  renderReviewsManager(box) {
    const reviews = this.db.getReviews();
    box.innerHTML = `
      <div class="feature-card">
        <h3 style="margin-bottom: 14px;">Отзывы покупателей (${reviews.length})</h3>
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${reviews
            .map(
              (r) => `
            <div style="border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <div>
                  <b>${escapeHtml(r.authorName)}</b> · <span style="color: #e5a400;">${"★".repeat(r.rating)}</span>
                  ${r.verifiedPurchase ? `<span class="badge-tag new" style="margin-left:6px;">Подтверждённая покупка</span>` : ""}
                </div>
                <span style="font-size: 12px; color: var(--text-muted);">${new Date(r.createdAt).toLocaleDateString("ru-RU")}</span>
              </div>
              <p style="font-size: 14px; margin-bottom: 10px;">${escapeHtml(r.text)}</p>
              ${
                r.sellerReply
                  ? `<div class="timeline-comment"><b>Ответ VESTA:</b> ${escapeHtml(r.sellerReply.text)}</div>`
                  : `
                  <div style="display: flex; gap: 8px;">
                    <input type="text" id="replyInput_${escapeHtml(r.id)}" placeholder="Написать официальный ответ магазина..." style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg)">
                    <button class="secondary-btn send-reply-btn" data-id="${escapeHtml(r.id)}" style="padding: 8px 14px; font-size: 12px;">Ответить</button>
                  </div>
                `
              }
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    box.querySelectorAll(".send-reply-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const revId = btn.dataset.id;
        const inp = box.querySelector(`#replyInput_${revId}`);
        if (!inp.value.trim()) return;
        this.db.replyToReview(revId, inp.value);
        this.toast("Ответ опубликован");
        this.renderReviewsManager(box);
      });
    });
  }

  /* ==========================================
     8. ЖУРНАЛ ДЕЙСТВИЙ ПРОДАВЦА (AUDIT LOGS)
     ========================================== */
  renderAuditLogs(box) {
    const logs = this.db.getSellerLogs();
    box.innerHTML = `
      <div class="feature-card">
        <h3 style="margin-bottom: 14px;">Журнал действий продавца и складских операций</h3>
        <table class="data-table">
          <thead><tr><th>Время</th><th>Сотрудник</th><th>Тип события</th><th>Детали операции</th></tr></thead>
          <tbody>
            ${logs
              .map(
                (l) => `
              <tr>
                <td>${new Date(l.timestamp).toLocaleString("ru-RU")}</td>
                <td><b>${escapeHtml(l.actorName)}</b></td>
                <td><code>${escapeHtml(l.actionType)}</code></td>
                <td>${escapeHtml(l.details)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  /* ==========================================
     9. НАСТРОЙКИ МАГАЗИНА И ПОЛИТИК
     ========================================== */
  renderStoreSettings(box) {
    const s = this.db.getStoreSettings();
    box.innerHTML = `
      <div class="feature-card">
        <h3 style="margin-bottom: 16px;">Настройки доставки, контактов и правовых страниц</h3>
        <form id="storeSettingsForm" class="form-grid">
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            <div class="form-field">
              <label>Стоимость курьерской доставки (₸)</label>
              <input type="number" id="setCourierFee" value="${s.courierFee}">
            </div>
            <div class="form-field">
              <label>Бесплатная доставка от суммы (₸)</label>
              <input type="number" id="setFreeThreshold" value="${s.freeShippingThreshold}">
            </div>
            <div class="form-field">
              <label>Порог низкого остатка (шт.)</label>
              <input type="number" id="setLowStock" value="${s.lowStockThreshold}">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            <div class="form-field">
              <label>Контактный телефон</label>
              <input type="text" id="setPhone" value="${escapeHtml(s.supportPhone)}">
            </div>
            <div class="form-field">
              <label>Email службы поддержки</label>
              <input type="email" id="setEmail" value="${escapeHtml(s.supportEmail)}">
            </div>
            <div class="form-field">
              <label>Instagram</label>
              <input type="text" id="setInsta" value="${escapeHtml(s.instagram)}">
            </div>
          </div>

          <div class="form-field">
            <label>Условия возврата (отображаются на странице «Возврат»)</label>
            <textarea id="setReturnPolicy" rows="3">${escapeHtml(s.returnPolicyText)}</textarea>
          </div>

          <div class="form-field">
            <label>Политика конфиденциальности и пользовательское соглашение</label>
            <textarea id="setPrivacyPolicy" rows="3">${escapeHtml(s.privacyPolicyText)}</textarea>
          </div>

          <button type="submit" class="primary-btn" style="width: fit-content;">Сохранить настройки магазина</button>
        </form>
      </div>
    `;

    box.querySelector("#storeSettingsForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.db.saveStoreSettings({
        courierFee: Number(box.querySelector("#setCourierFee").value),
        freeShippingThreshold: Number(box.querySelector("#setFreeThreshold").value),
        lowStockThreshold: Number(box.querySelector("#setLowStock").value),
        supportPhone: box.querySelector("#setPhone").value.trim(),
        supportEmail: box.querySelector("#setEmail").value.trim(),
        instagram: box.querySelector("#setInsta").value.trim(),
        returnPolicyText: box.querySelector("#setReturnPolicy").value.trim(),
        privacyPolicyText: box.querySelector("#setPrivacyPolicy").value.trim()
      });
      this.toast("Настройки магазина сохранены");
      this.refreshBuyerCatalog();
    });
  }
}
