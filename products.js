/**
 * VESTA — Начальный каталог, коллекции, комплекты «Собери образ», промокоды и тестовые профили
 * Сохраняет все 8 оригинальных товаров из index23.html и обогащает их точными остатками по каждому
 * сочетанию размера и цвета, датой добавления (createdAt), составом ткани и уходом.
 */

export const INITIAL_SEED_DATA = {
  categories: [
    {
      id: "cat_clothing",
      name: "Одежда",
      slug: "Одежда",
      subtitle: "Архитектурный крой и благородные ткани",
      image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80"
    },
    {
      id: "cat_shoes",
      name: "Обувь",
      slug: "Обувь",
      subtitle: "Безупречная колодка и натуральная кожа",
      image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80"
    },
    {
      id: "cat_accessories",
      name: "Аксессуары",
      slug: "Аксессуары",
      subtitle: "Акценты, завершающие минималистичный силуэт",
      image: "https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?auto=format&fit=crop&w=900&q=80"
    }
  ],

  products: [
    {
      id: 1,
      name: "Oversize пиджак архитектурного кроя",
      brand: "VESTA",
      category: "Одежда",
      collection: "Atelier Autumn '26",
      price: 45900,
      oldPrice: 52900,
      colors: ["Чёрный", "Графит"],
      sizes: ["XS", "S", "M", "L", "XL"],
      season: "Осень",
      fabric: "78% шерсть мериноса, 22% шёлк; подкладка 100% вискоза",
      care: "Только деликатная сухая чистка",
      rating: 4.9,
      reviewsCount: 124,
      isNew: true,
      isSale: true,
      isBestseller: true,
      archived: false,
      createdAt: "2026-10-18T10:00:00.000Z",
      stock: {
        "XS_Чёрный": 4,
        "S_Чёрный": 7,
        "M_Чёрный": 5,
        "L_Чёрный": 2,
        "XL_Чёрный": 0,
        "XS_Графит": 3,
        "S_Графит": 4,
        "M_Графит": 6,
        "L_Графит": 3,
        "XL_Графит": 2
      },
      images: [
        "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?auto=format&fit=crop&w=900&q=80"
      ],
      description:
        "Стильный oversize пиджак свободного кроя с выверенной линией плеча и матовой фурнитурой из рога. Подходит для повседневных и деловых монохромных образов."
    },
    {
      id: 2,
      name: "Белая рубашка из плотного поплина",
      brand: "MONO",
      category: "Одежда",
      collection: "Essential Capsule",
      price: 21900,
      oldPrice: null,
      colors: ["Белый", "Бежевый"],
      sizes: ["XS", "S", "M", "L"],
      season: "Лето",
      fabric: "100% длинноволокнистый органический хлопок",
      care: "Бережная стирка при 30°C, глажка с паром",
      rating: 4.8,
      reviewsCount: 87,
      isNew: true,
      isSale: false,
      isBestseller: true,
      archived: false,
      createdAt: "2026-10-16T14:20:00.000Z",
      stock: {
        "XS_Белый": 6,
        "S_Белый": 9,
        "M_Белый": 8,
        "L_Белый": 4,
        "XS_Бежевый": 3,
        "S_Бежевый": 5,
        "M_Бежевый": 4,
        "L_Бежевый": 2
      },
      images: [
        "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?auto=format&fit=crop&w=900&q=80"
      ],
      description:
        "Базовая белая рубашка из дышащего хрустящего поплина с перламутровыми пуговицами. Идеально держит форму воротника и манжет."
    },
    {
      id: 3,
      name: "Бежевый двубортный тренч",
      brand: "URBAN",
      category: "Одежда",
      collection: "City Raincoat",
      price: 58900,
      oldPrice: null,
      colors: ["Бежевый", "Чёрный"],
      sizes: ["S", "M", "L", "XL"],
      season: "Весна",
      fabric: "100% хлопковый габардин с водоотталкивающей пропиткой",
      care: "Профессиональная химчистка",
      rating: 4.9,
      reviewsCount: 63,
      isNew: false,
      isSale: false,
      isBestseller: true,
      archived: false,
      createdAt: "2026-09-25T09:15:00.000Z",
      stock: {
        "S_Бежевый": 5,
        "M_Бежевый": 4,
        "L_Бежевый": 2,
        "XL_Бежевый": 1,
        "S_Чёрный": 3,
        "M_Чёрный": 5,
        "L_Чёрный": 3,
        "XL_Чёрный": 2
      },
      images: [
        "https://images.unsplash.com/photo-1539533113208-f6df8cc8b543?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1544022613-e87ca75a784a?auto=format&fit=crop&w=900&q=80"
      ],
      description:
        "Классический тренч макси-длины из плотного габардина с кокеткой, ветрозащитным клапаном и ремнём с пряжкой в тон."
    },
    {
      id: 4,
      name: "Кроссовки Classic из гладкой кожи",
      brand: "NOVA",
      category: "Обувь",
      collection: "Minimal Step",
      price: 39900,
      oldPrice: 45900,
      colors: ["Белый", "Чёрный"],
      sizes: ["36", "37", "38", "39", "40"],
      season: "Лето",
      fabric: "Верх: 100% телячья кожа; подошва: облегчённый термополиуретан",
      care: "Очистка мягкой влажной салфеткой и кремом для гладкой кожи",
      rating: 4.7,
      reviewsCount: 215,
      isNew: false,
      isSale: true,
      isBestseller: true,
      archived: false,
      createdAt: "2026-09-12T12:00:00.000Z",
      stock: {
        "36_Белый": 3,
        "37_Белый": 6,
        "38_Белый": 8,
        "39_Белый": 5,
        "40_Белый": 2,
        "36_Чёрный": 2,
        "37_Чёрный": 4,
        "38_Чёрный": 5,
        "39_Чёрный": 4,
        "40_Чёрный": 3
      },
      images: [
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=900&q=80"
      ],
      description:
        "Универсальные минималистичные кроссовки с анатомической кожаной стелькой для безупречного комфорта в течение всего дня."
    },
    {
      id: 5,
      name: "Структурированная кожаная сумка Тоут",
      brand: "VESTA",
      category: "Аксессуары",
      collection: "Atelier Autumn '26",
      price: 32900,
      oldPrice: null,
      colors: ["Коричневый", "Чёрный"],
      sizes: ["ONE SIZE"],
      season: "Осень",
      fabric: "100% натуральная зернистая кожа, замшевая внутренняя отделка",
      care: "Хранить в пыльнике, избегать длительного воздействия влаги",
      rating: 4.8,
      reviewsCount: 92,
      isNew: true,
      isSale: false,
      isBestseller: false,
      archived: false,
      createdAt: "2026-10-14T16:40:00.000Z",
      stock: {
        "ONE SIZE_Коричневый": 5,
        "ONE SIZE_Чёрный": 7
      },
      images: [
        "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80"
      ],
      description:
        "Вместительная архитектурная сумка из натуральной кожи. Вмещает ноутбук 14 дюймов, документы и ежедневные мелочи."
    },
    {
      id: 6,
      name: "Трикотажный свитер с кашемиром",
      brand: "MONO",
      category: "Одежда",
      collection: "Nordic Knit",
      price: 28900,
      oldPrice: 34900,
      colors: ["Бежевый", "Графит"],
      sizes: ["S", "M", "L", "XL"],
      season: "Зима",
      fabric: "70% шерсть мериноса экстрафайн, 30% монгольский кашемир",
      care: "Ручная стирка в прохладной воде, сушка в горизонтальном положении",
      rating: 4.9,
      reviewsCount: 156,
      isNew: false,
      isSale: true,
      isBestseller: true,
      archived: false,
      createdAt: "2026-10-02T11:30:00.000Z",
      stock: {
        "S_Бежевый": 6,
        "M_Бежевый": 5,
        "L_Бежевый": 3,
        "XL_Бежевый": 1,
        "S_Графит": 4,
        "M_Графит": 6,
        "L_Графит": 4,
        "XL_Графит": 2
      },
      images: [
        "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1610652492500-ded49ceeb378?auto=format&fit=crop&w=900&q=80"
      ],
      description:
        "Мягкий тёплый свитер свободного кроя с фактурным воротом и спущенной линией плеча. Не колется и сохраняет тепло."
    },
    {
      id: 7,
      name: "Чёрные брюки палаццо со защипами",
      brand: "URBAN",
      category: "Одежда",
      collection: "Atelier Autumn '26",
      price: 24900,
      oldPrice: null,
      colors: ["Чёрный", "Графит"],
      sizes: ["XS", "S", "M", "L", "XL"],
      season: "Осень",
      fabric: "65% поливискоза, 32% шерсть, 3% эластан",
      care: "Деликатная стирка при 30°C",
      rating: 4.6,
      reviewsCount: 74,
      isNew: true,
      isSale: false,
      isBestseller: false,
      archived: false,
      createdAt: "2026-10-19T08:00:00.000Z",
      stock: {
        "XS_Чёрный": 5,
        "S_Чёрный": 8,
        "M_Чёрный": 7,
        "L_Чёрный": 4,
        "XL_Чёрный": 2,
        "XS_Графит": 3,
        "S_Графит": 5,
        "M_Графит": 4,
        "L_Графит": 3,
        "XL_Графит": 1
      },
      images: [
        "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1506629905607-d9d7c4e3f3d6?auto=format&fit=crop&w=900&q=80"
      ],
      description:
        "Базовые брюки прямого широкого кроя с высокой посадкой и глубокими защипами у пояса. Составляют идеальную пару к oversize пиджаку VESTA."
    },
    {
      id: 8,
      name: "Солнцезащитные очки в ацетатной оправе",
      brand: "NOVA",
      category: "Аксессуары",
      collection: "Optics Studio",
      price: 15900,
      oldPrice: 19900,
      colors: ["Чёрный", "Коричневый"],
      sizes: ["ONE SIZE"],
      season: "Лето",
      fabric: "Итальянский целлюлозный ацетат, линзы UV400 с антибликовым покрытием",
      care: "Протирать комплектной салфеткой из микрофибры, хранить в жёстком футляре",
      rating: 4.5,
      reviewsCount: 48,
      isNew: false,
      isSale: true,
      isBestseller: false,
      archived: false,
      createdAt: "2026-08-29T15:10:00.000Z",
      stock: {
        "ONE SIZE_Чёрный": 6,
        "ONE SIZE_Коричневый": 4
      },
      images: [
        "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=900&q=80"
      ],
      description:
        "Геометричные солнцезащитные очки с защитой UV400 и выверенной посадкой на переносице. В комплекте кожаный кофр."
    }
  ],

  promoCodes: [
    {
      id: "promo_vesta10",
      code: "VESTA10",
      type: "percent",
      value: 10,
      minOrderAmount: 15000,
      maxUses: 500,
      usedCount: 12,
      usedByUids: [],
      expiresAt: "2027-12-31",
      active: true
    },
    {
      id: "promo_atelier5000",
      code: "ATELIER5000",
      type: "fixed",
      value: 5000,
      minOrderAmount: 45000,
      maxUses: 100,
      usedCount: 4,
      usedByUids: [],
      expiresAt: "2027-06-30",
      active: true
    }
  ],

  reviews: [
    {
      id: "rev_seed_1",
      productId: 1,
      orderId: "VS-884120",
      verifiedPurchase: true,
      uid: "usr_demo_buyer",
      authorName: "Анна К.",
      rating: 5,
      text: "Очень понравилось качество шерсти и архитектурная посадка в плечах. На рост 172 размер M сел именно так, как хотелось.",
      sellerReply: {
        text: "Благодарим за отзыв, Анна! Рады, что пиджак из осенней капсулы оправдал ваши ожидания.",
        repliedAt: "2026-10-19T12:00:00.000Z",
        sellerName: "VESTA Concierge"
      },
      createdAt: "2026-10-18T18:30:00.000Z"
    },
    {
      id: "rev_seed_2",
      productId: 1,
      orderId: "VS-791044",
      verifiedPurchase: true,
      uid: "usr_demo_2",
      authorName: "Мария В.",
      rating: 5,
      text: "Размер полностью соответствует таблице. Взяла в комплекте с чёрными брюками палаццо — получился идеальный костюм.",
      sellerReply: null,
      createdAt: "2026-10-17T09:15:00.000Z"
    },
    {
      id: "rev_seed_3",
      productId: 4,
      orderId: "VS-651902",
      verifiedPurchase: true,
      uid: "usr_demo_buyer",
      authorName: "Алия Т.",
      rating: 5,
      text: "Мягкая кожа, нигде не натирают с первого дня. Очень аккуратная минималистичная пара.",
      sellerReply: null,
      createdAt: "2026-10-10T14:40:00.000Z"
    }
  ],

  users: [
    {
      uid: "usr_demo_seller",
      name: "Администратор VESTA",
      email: "seller@vesta.kz",
      phone: "+7 701 555 01 01",
      passwordHash: btoa(encodeURIComponent("seller123")),
      role: "seller",
      addresses: ["г. Алматы, пр. Аль-Фараби 77/8, Esentai Mall, 2 этаж"],
      createdAt: "2026-01-10T09:00:00.000Z"
    },
    {
      uid: "usr_demo_buyer",
      name: "Анна Каримова",
      email: "buyer@vesta.kz",
      phone: "+7 702 900 44 55",
      passwordHash: btoa(encodeURIComponent("buyer123")),
      role: "buyer",
      addresses: ["г. Алматы, ул. Кунаева 124, кв. 38"],
      createdAt: "2026-05-15T11:20:00.000Z"
    }
  ],

  orders: [
    {
      id: "VS-884120",
      idempotencyKey: "seed_order_1",
      uid: "usr_demo_buyer",
      createdAt: "2026-10-18T11:15:00.000Z",
      updatedAt: "2026-10-19T14:20:00.000Z",
      expectedDeliveryDate: "2026-10-21",
      demoTrackingNumber: "VST-KZ-49201844",
      isDemoTracking: true,
      orderStatus: "in_transit",
      paymentStatus: "paid",
      deliveryStatus: "in_transit",
      deliveryMethod: "courier",
      paymentMethod: "demo_card",
      customer: {
        name: "Анна Каримова",
        phone: "+7 702 900 44 55",
        email: "buyer@vesta.kz",
        address: "г. Алматы, ул. Кунаева 124, кв. 38",
        comment: "Позвонить за 30 минут до приезда курьера"
      },
      items: [
        {
          productId: 1,
          name: "Oversize пиджак архитектурного кроя",
          brand: "VESTA",
          image: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=80",
          size: "M",
          color: "Чёрный",
          quantity: 1,
          unitPrice: 45900,
          oldUnitPrice: 52900,
          lineTotal: 45900
        },
        {
          productId: 7,
          name: "Чёрные брюки палаццо со защипами",
          brand: "URBAN",
          image: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=900&q=80",
          size: "M",
          color: "Чёрный",
          quantity: 1,
          unitPrice: 24900,
          oldUnitPrice: 24900,
          lineTotal: 24900
        }
      ],
      pricingSnapshot: {
        subtotal: 70800,
        catalogDiscountTotal: 7000,
        promoCode: "VESTA10",
        promoDiscount: 7080,
        shippingCost: 0,
        total: 63720,
        currency: "₸"
      },
      stockReserved: true,
      cancelReason: null,
      statusHistory: [
        {
          id: "evt_s1",
          stage: "created",
          title: "Заказ оформлен",
          description: "Заказ VS-884120 создан и товары зарезервированы на складе.",
          actor: "Покупатель",
          comment: "",
          timestamp: "2026-10-18T11:15:00.000Z"
        },
        {
          id: "evt_s2",
          stage: "paid",
          title: "Оплата подтверждена",
          description: "Демо-платёж PAY-SEED-101 на сумму 63 720 ₸ подтверждён.",
          actor: "Платёжный шлюз (Симуляция)",
          comment: "Код авторизации: DEMO-200",
          timestamp: "2026-10-18T11:16:10.000Z"
        },
        {
          id: "evt_s3",
          stage: "accepted",
          title: "Продавец принял заказ",
          description: "Наличие всех позиций на складе подтверждено, заказ передан в комплектацию.",
          actor: "Продавец (Администратор VESTA)",
          comment: "Костюм проверен технологом, готовим кофр.",
          timestamp: "2026-10-18T13:05:00.000Z"
        },
        {
          id: "evt_s4",
          stage: "packing",
          title: "Собирается",
          description: "Товары упакованы в фирменный кофр VESTA с вешалкой.",
          actor: "Продавец (Администратор VESTA)",
          comment: "",
          timestamp: "2026-10-18T16:40:00.000Z"
        },
        {
          id: "evt_s5",
          stage: "shipped",
          title: "Передан курьеру",
          description: "Отправление передано логистической службе. Демо трек-номер: VST-KZ-49201844",
          actor: "Продавец (Администратор VESTA)",
          comment: "Экспресс-доставка по Алматы",
          timestamp: "2026-10-19T10:00:00.000Z"
        },
        {
          id: "evt_s6",
          stage: "in_transit",
          title: "В пути",
          description: "Заказ следует в распределительный узел вашего района.",
          actor: "Продавец (Администратор VESTA)",
          comment: "Ожидаемая доставка завтра в первой половине дня",
          timestamp: "2026-10-19T14:20:00.000Z"
        }
      ]
    }
  ],

  payments: [
    {
      id: "PAY-SEED-101",
      idempotencyKey: "seed_pay_1",
      orderId: "VS-884120",
      uid: "usr_demo_buyer",
      amount: 63720,
      currency: "₸",
      method: "demo_card",
      status: "paid",
      message: "Транзакция успешно авторизована демо-банком (Код авторизации: DEMO-200).",
      isSimulation: true,
      createdAt: "2026-10-18T11:16:10.000Z"
    }
  ],

  inventoryLogs: [
    {
      id: "log_seed_1",
      actionType: "ORDER_STAGE",
      details: "Заказ VS-884120 переведён в статус «В пути»",
      actorUid: "usr_demo_seller",
      actorName: "Администратор VESTA",
      timestamp: "2026-10-19T14:20:00.000Z"
    }
  ],

  stockSubscriptions: []
};

/**
 * Готовые капсульные комплекты «Собери образ» (Lookbooks)
 */
export const LOOKBOOK_OUTFITS = [
  {
    id: "look_monolith",
    title: "Монолитный тейлоринг",
    subtitle: "Архитектурный пиджак, брюки палаццо и структурированный кожаный тоут",
    badge: "Выбор стилиста",
    productIds: [1, 7, 5],
    defaultSizes: { 1: "M", 7: "M", 5: "ONE SIZE" },
    defaultColors: { 1: "Чёрный", 7: "Чёрный", 5: "Чёрный" }
  },
  {
    id: "look_autumn_city",
    title: "Городской минимализм",
    subtitle: "Бежевый тренч из габардина, поплиновая рубашка и кожаные кроссовки",
    badge: "Капсула Осень '26",
    productIds: [3, 2, 4],
    defaultSizes: { 3: "M", 2: "M", 4: "38" },
    defaultColors: { 3: "Бежевый", 2: "Белый", 4: "Белый" }
  },
  {
    id: "look_soft_cashmere",
    title: "Тактильный комфорт",
    subtitle: "Свитер с монгольским кашемиром и солнцезащитные очки в ацетатной оправе",
    badge: "Weekend Edit",
    productIds: [6, 8],
    defaultSizes: { 6: "M", 8: "ONE SIZE" },
    defaultColors: { 6: "Бежевый", 8: "Чёрный" }
  }
];
