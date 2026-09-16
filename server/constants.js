module.exports = {
  ROLES: Object.freeze({
    ADMIN: "admin",
    STAFF: "staff",
    VENDOR: "vendor",
    USER: "user",
  }),

  LOGIN_TYPES: Object.freeze({
    EMAIL: "email",
    MOBILE: "mobile",
    GOOGLE: "google",
    PASSWORD: "password",
    OTHER: "other",
  }),

  PLATFORMS: Object.freeze({
    WEB: "web",
    ANDROID: "android",
    IOS: "ios",
  }),

  SUBSCRIPTION_TYPES: Object.freeze({
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    QUATERLY: "quarterly",
    HALF_YEARLY: "half_yearly",
    YEARLY: "yearly",
  }),

  DURATION_MAP: Object.freeze({
    weekly: 7,
    monthly: 30,
    quarterly: 90,
    half_yearly: 180,
    yearly: 365,
  }),

  SUBSCRIPTION_PLANS: Object.freeze({
    FREE: "free",
    BASIC: "basic",
    PREMIUM: "premium",
    Family: "family",
  }),

  PRODUCT_TYPES: Object.freeze({
    GROCERY: "grocery",
    ELECTRONICS: "electronics",
    CLOTHING: "clothing",
  }),

  // Location ab do tarah ki hoti hai — customer ka address, ya vendor ki branch
  LOCATION_TYPES: Object.freeze({
    CUSTOMER: "CUSTOMER",
    VENDOR_BRANCH: "VENDOR_BRANCH",
  }),

  VENDOR_STATUS: Object.freeze({
    APPROVED: "APPROVED",
    SUSPENDED: "SUSPENDED",
  }),

  ORDER_STATUS: Object.freeze({
    INITIATED: "INITIATED", // legacy — COD-only flow me naya order kabhi INITIATED nahi banta
    PENDING: "PENDING", // vendor ke paas aa gaya
    ACCEPTED: "ACCEPTED",
    PACKED: "PACKED",
    OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
    DELIVERED: "DELIVERED",
    CANCELLED: "CANCELLED", // customer ne cancel kiya
    REJECTED: "REJECTED", // vendor ne reject kiya
    CONFIRMED: "CONFIRMED", // legacy — purane docs ke liye
  }),

  PAYMENT_METHODS: Object.freeze({
    COD: "COD",
    ONLINE: "ONLINE", // legacy — abhi disabled, purane orders ke liye enum me hai
  }),

  PAYMENT_STATUS: Object.freeze({
    NOT_REQUIRED: "NOT_REQUIRED",
    INITIATED: "INITIATED",
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
  }),

  // App/panel in codes pe branch karte hain — message badle to bhi code na badle
  ERROR_CODES: Object.freeze({
    PINCODE_REQUIRED: "PINCODE_REQUIRED",
    PINCODE_NOT_SERVICEABLE: "PINCODE_NOT_SERVICEABLE",
    PINCODE_ALREADY_ASSIGNED: "PINCODE_ALREADY_ASSIGNED",
    PRODUCT_NOT_AVAILABLE_HERE: "PRODUCT_NOT_AVAILABLE_HERE",
    CART_VENDOR_CONFLICT: "CART_VENDOR_CONFLICT",
    VENDOR_NOT_SERVICEABLE: "VENDOR_NOT_SERVICEABLE",
    VENDOR_PICKUP_MISSING: "VENDOR_PICKUP_MISSING",
    STOCK_UNAVAILABLE: "STOCK_UNAVAILABLE",
    OUT_OF_RADIUS: "OUT_OF_RADIUS",
    MIN_ORDER_NOT_MET: "MIN_ORDER_NOT_MET",
    INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
    CART_NOT_VERIFIED: "CART_NOT_VERIFIED",
    FORBIDDEN: "FORBIDDEN",
  }),

  // Platform ke HARD LIMITS. Koi vendor inse upar nahi ja sakta.
  // Tab lagte hain jab `Setting` doc me value na ho.
  DELIVERY_SETTINGS: Object.freeze({
    MAX_RADIUS_KM: 50,
    MAX_ALLOWED_DELIVERY_CHARGE: 200,
  }),

  /**
   * Naye vendor ki delivery settings ka starting point.
   *
   * Values wahi hain jo purane global `Setting.delivery` me thi — taaki
   * vendor ko khali form na mile, ready-made rates milein.
   *
   * 🔑 `isEnabled: false` — matlab ye values bhari hui hongi PAR charge ₹0
   *    rahega jab tak vendor apne panel se toggle on na kare.
   *
   * `freeDeliveryAbove` / `maxRadiusKm` `null` hain:
   *   - freeDeliveryAbove 0 hota to SAB free ho jata
   *   - maxRadiusKm null = platform ka 50km lagega
   */
  DEFAULT_VENDOR_DELIVERY: Object.freeze({
    isEnabled: false,
    baseCharge: 30,
    perKmRate: 5,
    perKgRate: 1.5,
    minDeliveryCharge: 40,
    baseMaxCharge: 150,
    maxPerKgIncrement: 1.2,
    maxPerKmIncrement: 4,
    freeDeliveryAbove: null,
    minOrderAmount: 0,
    maxRadiusKm: null,
  }),

  // Address ka default country — ek hi jagah, taaki har service apna
  // `|| "india"` na likhe. Title case isliye ki ab display fields jaise
  // dikhne chahiye waise save hote hain.
  // (`isValidZipCode()` country ko case-insensitive padhta hai.)
  DEFAULT_COUNTRY: "India",

  SHOP_ADDRESS: Object.freeze({
    CITY: "davangeere",
    STATE: "karnatka",
    COUNTRY: "india",
    ZIPCODE: "123456",
    LAT: 12.9716,
    LNG: 77.5946,
  }),

  ZIP_CODE_REGEX_MAP: Object.freeze({
    IN: /^[1-9][0-9]{5}$/, // India (6 digits)
    US: /^\d{5}(-\d{4})?$/, // USA (ZIP or ZIP+4)
    CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, // Canada (A1A 1A1)
    UK: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, // United Kingdom (SW1A 1AA)
    AU: /^\d{4}$/, // Australia (4 digits)
    DE: /^\d{5}$/, // Germany
    FR: /^\d{5}$/, // France
    IT: /^\d{5}$/, // Italy
    ES: /^\d{5}$/, // Spain
    BR: /^\d{5}-?\d{3}$/, // Brazil (12345-678 or 12345678)
    RU: /^\d{6}$/, // Russia
  }),

  COUNTRY_NAME_TO_ISO: Object.freeze({
    india: "IN",
    unitedstates: "US",
    usa: "US",
    canada: "CA",
    uk: "UK",
    unitedkingdom: "UK",
    australia: "AU",
    germany: "DE",
    france: "FR",
    italy: "IT",
    spain: "ES",
    brazil: "BR",
    russia: "RU",
  }),

  DEFAULT_IMAGES: Object.freeze({
    CATEGORY:
      "https://res.cloudinary.com/drvdnqydw/image/upload/f_auto,q_auto/v1/Images/hrhc8iwbjl2qnnqu9kaq?_a=BAMAK+Jw0",
    SUBCATEGORY:
      "https://res.cloudinary.com/drvdnqydw/image/upload/f_auto,q_auto/v1/Images/zsbowllown6ddeb4jnw0?_a=BAMAK+Jw0",
    PRODUCT:
      "https://res.cloudinary.com/drvdnqydw/image/upload/f_auto,q_auto/v1/Images/zsbowllown6ddeb4jnw0?_a=BAMAK+Jw0",
    BANNER:
      "https://res.cloudinary.com/drvdnqydw/image/upload/f_auto,q_auto/v1/Images/zsbowllown6ddeb4jnw0?_a=BAMAK+Jw0",
  }),
};
