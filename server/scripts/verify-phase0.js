/** Phase 0 verification — koi DB connection nahi, sirf logic + route guards. */
process.env.JWT_SECRET = "test";
const mongoose = require("mongoose");

const {
  buildOrderScope,
  assertOrderAccess,
} = require("../services/orders/assertOrderAccess");
const {
  assertOwnership,
} = require("../services/assertOwnership");
const {
  calculateDeliveryCharges,
} = require("../helpers/orders/calculateDeliveryCharges");
const { ROLES } = require("../constants");

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}  ${extra}`);
  }
};
const throws = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
};
const hr = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}`);

const A = new mongoose.Types.ObjectId();
const B = new mongoose.Types.ObjectId();

// ═══════════════════════════════════════════════════════════
hr("buildOrderScope — role wise");
ok(
  "customer → apne orders",
  String(buildOrderScope({ userId: A, role: ROLES.USER })?.userId) === String(A),
);
ok(
  "vendor → apne vendorId ke orders",
  String(buildOrderScope({ userId: A, role: ROLES.VENDOR })?.vendorId) === String(A),
);
ok(
  "admin → koi filter nahi",
  Object.keys(buildOrderScope({ userId: A, role: ROLES.ADMIN })).length === 0,
);
ok(
  "staff → koi filter nahi",
  Object.keys(buildOrderScope({ userId: A, role: ROLES.STAFF })).length === 0,
);
ok("actor missing → null (service 401 karega)", buildOrderScope(undefined) === null);
ok("role missing → null", buildOrderScope({ userId: A }) === null);

// ═══════════════════════════════════════════════════════════
hr("assertOrderAccess");
ok(
  "customer apna order dekh sakta hai",
  assertOrderAccess({ userId: A }, { userId: A, role: ROLES.USER }) === true,
);
const e1 = throws(() =>
  assertOrderAccess({ userId: B }, { userId: A, role: ROLES.USER }),
);
ok("customer doosre ka order → 404", e1?.statusCode === 404, `got ${e1?.statusCode}`);
ok("...aur code FORBIDDEN", e1?.code === "FORBIDDEN", `got ${e1?.code}`);
ok(
  "vendor apna (vendorId) order dekh sakta hai",
  assertOrderAccess({ vendorId: A, userId: B }, { userId: A, role: ROLES.VENDOR }) === true,
);
const e2 = throws(() =>
  assertOrderAccess({ vendorId: B, userId: A }, { userId: A, role: ROLES.VENDOR }),
);
ok("vendor doosre vendor ka order → 404", e2?.statusCode === 404);
ok(
  "vendor ko customer-match se access NAHI milta",
  throws(() =>
    assertOrderAccess({ userId: A, vendorId: B }, { userId: A, role: ROLES.VENDOR }),
  ) !== null,
);
ok(
  "admin sab dekh sakta hai",
  assertOrderAccess({ userId: B, vendorId: B }, { userId: A, role: ROLES.ADMIN }) === true,
);
ok(
  "order ke bina → 404",
  throws(() => assertOrderAccess(null, { userId: A, role: ROLES.ADMIN }))?.statusCode === 404,
);

// ═══════════════════════════════════════════════════════════
hr("assertOwnership (category / subcategory / product)");
ok(
  "vendor apna resource",
  assertOwnership({ userId: A }, { userId: A, role: ROLES.VENDOR }) === true,
);
const e3 = throws(() =>
  assertOwnership({ userId: B }, { userId: A, role: ROLES.VENDOR }, "category"),
);
ok("vendor doosre ka resource → 403", e3?.statusCode === 403, `got ${e3?.statusCode}`);
ok("...message me 'another vendor'", /another vendor/.test(e3?.message || ""));
ok(
  "admin sab",
  assertOwnership({ userId: B }, { userId: A, role: ROLES.ADMIN }) === true,
);
ok(
  "actor ke bina → 401",
  throws(() => assertOwnership({ userId: A }, undefined))?.statusCode === 401,
);

// ═══════════════════════════════════════════════════════════
hr("calculateDeliveryCharges — NaN safe + koi chhupa hua default nahi");
// NOTE: pehle missing fields `DELIVERY_SETTINGS` constants se bhar jate the
// (26kg/3km → ₹84). Ab pricing poori tarah vendor config se hai — jo set
// nahi wo 0. Isliye khali config = ₹0.
const noSetting = calculateDeliveryCharges(26, 3, {});
ok(`khali config → ₹0 (got ₹${noSetting})`, noSetting === 0);
ok("undefined config → ₹0", calculateDeliveryCharges(26, 3, undefined) === 0);
ok("null config → ₹0", calculateDeliveryCharges(26, 3, null) === 0);

const conf = { baseCharge: 30, perKmRate: 5, perKgRate: 1.5 };
// 30 + 3*5 + 26*1.5 = 84
ok(`poora config → ₹84 (got ₹${calculateDeliveryCharges(26, 3, conf)})`,
  calculateDeliveryCharges(26, 3, conf) === 84);
ok("sirf baseCharge → ₹30 (perKm/perKg 0, code se nahi aate)",
  calculateDeliveryCharges(26, 3, { baseCharge: 30 }) === 30);
ok("minDeliveryCharge floor lagta hai",
  calculateDeliveryCharges(0, 0, { baseCharge: 10, minDeliveryCharge: 40 }) === 40);
ok("minDeliveryCharge 0 → koi floor nahi",
  calculateDeliveryCharges(0, 0, { baseCharge: 10, minDeliveryCharge: 0 }) === 10);

// 🔑 cap fields null = KOI CAP NAHI (0 hota to charge hamesha 0 rehta)
ok("cap fields absent → koi cap nahi", calculateDeliveryCharges(26, 3, conf) === 84);
ok("cap null → koi cap nahi",
  calculateDeliveryCharges(26, 3, { ...conf, baseMaxCharge: null,
    maxPerKgIncrement: null, maxPerKmIncrement: null }) === 84);
ok("cap set → charge cap tak clamp",
  calculateDeliveryCharges(26, 3, { ...conf, baseMaxCharge: 50,
    maxPerKgIncrement: 0, maxPerKmIncrement: 0 }) === 50);
ok("negative charge kabhi nahi", calculateDeliveryCharges(26, 3, { baseCharge: -100 }) === 0);
ok("garbage weight/distance → finite", Number.isFinite(calculateDeliveryCharges("abc", "xyz", conf)));

// ═══════════════════════════════════════════════════════════
hr("Route guards");
// paths server/ root ke relative hain
const MW = require("../middlewares");

// Middleware ko NAAM se nahi, REFERENCE se match karo — asyncWrapper ke baad
// har guard ka function.name khali hota hai.
const GUARD_REF = new Map([
  [MW.verifyJwtToken, "verifyJwtToken"],
  [MW.isAdmin, "isAdmin"],
  [MW.isVendor, "isVendor"],
  [MW.isUser, "isUser"],
  [MW.isStaff, "isStaff"],
]);

const collect = (file) => {
  const mod = require(`../routes/${file}`);
  const r = mod.router || mod;
  const out = [];
  (r.stack || []).forEach((layer) => {
    if (!layer.route) return;
    const method = Object.keys(layer.route.methods)[0]?.toUpperCase();
    const guards = layer.route.stack
      .map((s) => GUARD_REF.get(s.handle))
      .filter(Boolean);
    out.push({
      method,
      path: `/${file.replace(/\.js$/, "")}${layer.route.path}`,
      guards,
      nHandlers: layer.route.stack.length,
    });
  });
  return out;
};

const FILES = [
  "auth.js", "banners.js", "carts.js", "categories.js", "locations.js",
  "orders.js", "privacy-and-policies.js", "products.js", "settings.js",
  "subCategories.js", "subscriptions.js", "terms-and-conditions.js", "users.js",
];
const routes = FILES.flatMap(collect);

const find = (method, path) =>
  routes.find((r) => r.method === method && r.path === path);

const guard = (method, path, expected) => {
  const r = find(method, path);
  if (!r) return ok(`${method} ${path}`, false, "ROUTE NOT FOUND");
  ok(
    `${method} ${path} → ${expected}`,
    r.guards.includes(expected),
    `got [${r.guards.join(", ") || "NONE"}]`,
  );
};

guard("GET", "/users/getAll", "isAdmin");
guard("GET", "/users/get", "verifyJwtToken");
guard("PUT", "/users/update", "verifyJwtToken");
guard("POST", "/orders/create", "isUser");
// NOTE: `PUT /orders/update/:id` Phase 5 me `PUT /orders/:id/status`
// (isVendor + state machine) se replace ho gaya — verify-phase45.js dekho.
guard("GET", "/orders/getAll", "verifyJwtToken");
guard("GET", "/orders/get/:id", "verifyJwtToken");
guard("POST", "/categories/create", "isVendor");
guard("PUT", "/categories/update/:id", "isVendor");
guard("DELETE", "/categories/delete/:id", "isVendor");
guard("GET", "/categories/getAll", "verifyJwtToken");
guard("POST", "/subCategories/:categoryId/create", "isVendor");
guard("PUT", "/subCategories/update/:id", "isVendor");
guard("DELETE", "/subCategories/delete/:id", "isVendor");
guard("POST", "/products/create", "isVendor");
guard("PUT", "/products/update/:id", "isVendor");
guard("DELETE", "/products/delete/:id", "isVendor");
guard("GET", "/products/getAll", "verifyJwtToken");
guard("POST", "/locations/create", "verifyJwtToken");
guard("GET", "/locations/getAll", "verifyJwtToken");
guard("DELETE", "/locations/delete/:id", "verifyJwtToken");
// Phase 3 me cart routes `verifyJwtToken` se `isUser` pe tighten ho gaye
// (vendor/admin ka cart hota hi nahi) — verify-phase3.js dekho.
guard("POST", "/carts/add-or-update", "isUser");
guard("GET", "/carts/get", "isUser");

hr("Unmounted routes (ab exist nahi karne chahiye)");
ok("POST /orders/verify-payment hata diya", !find("POST", "/orders/verify-payment"));
ok(
  "PUT /products/update-product-locations hata diya",
  !routes.some((r) => r.path.includes("update-product-locations")),
);
ok(
  "DELETE /products/remove-product-locations hata diya",
  !routes.some((r) => r.path.includes("remove-product-locations")),
);

hr("Har protected route pe koi na koi auth guard hai?");
const PUBLIC = [
  "/auth/register", "/auth/login", "/auth/loginOrSignin-with-email",
  "/auth/verify-otp-email", "/auth/loginOrSignin-with-mobile",
  "/auth/verify-otp-mobile",
];
const unguarded = routes.filter(
  (r) => r.guards.length === 0 && !PUBLIC.includes(r.path),
);
ok(
  `unguarded protected routes: ${unguarded.length}`,
  unguarded.length === 0,
  "\n      " + unguarded.map((u) => `${u.method} ${u.path}`).join("\n      "),
);
console.log(`     (total routes scanned: ${routes.length})`);

// ═══════════════════════════════════════════════════════════
hr("Enums / constants");
const C = require("../constants");
ok("ORDER_STATUS me ACCEPTED hai", !!C.ORDER_STATUS.ACCEPTED);
ok("ORDER_STATUS me OUT_FOR_DELIVERY hai", !!C.ORDER_STATUS.OUT_FOR_DELIVERY);
ok("ORDER_STATUS me PAID NAHI hai (wo bug tha)", !C.ORDER_STATUS.PAID);
ok("ERROR_CODES me PINCODE_NOT_SERVICEABLE hai", !!C.ERROR_CODES.PINCODE_NOT_SERVICEABLE);
ok("LOCATION_TYPES ready", C.LOCATION_TYPES.VENDOR_BRANCH === "VENDOR_BRANCH");

const Order = require("../models/Order");
const statusEnum = Order.schema.path("status").enumValues;
ok(
  `Order.status enum me saare ORDER_STATUS (${statusEnum.length})`,
  Object.values(C.ORDER_STATUS).every((s) => statusEnum.includes(s)),
);
ok(
  "purane statuses (DELIVERED/CANCELLED) abhi bhi valid hain",
  statusEnum.includes("DELIVERED") && statusEnum.includes("CANCELLED"),
);
ok(
  "paymentMethod enum me ONLINE abhi bhi hai (purane 0 orders, par safe)",
  Order.schema.path("paymentMethod").enumValues.includes("ONLINE"),
);

hr("Indexes schema me declare hue?");
const idxOf = (m) => m.schema.indexes().map(([k]) => JSON.stringify(k));
const Product = require("../models/Product");
const Category = require("../models/Category");
const LocationM = require("../models/Location");
const CartM = require("../models/Cart");
ok("Product { userId, isDeleted, isActive, createdAt }",
  idxOf(Product).some((i) => i.includes('"userId":1') && i.includes('"isActive":1')));
ok("Category { userId, isDeleted, isActive }",
  idxOf(Category).some((i) => i.includes('"userId":1')));
ok("Order { vendorId, status, createdAt }",
  idxOf(Order).some((i) => i.includes('"vendorId":1')));
ok("Cart { userId, isPurchased, isDeleted }",
  idxOf(CartM).some((i) => i.includes('"isPurchased":1')));
ok("Location { zipcode }", idxOf(LocationM).some((i) => i.includes('"zipcode":1')));
ok(
  "Location ka galat `location_2dsphere` hata diya",
  !idxOf(LocationM).some((i) => i.includes('"location"')),
);

hr("Validators");
const { validateCreateOrder } = require("../validator/orders");
ok("COD order valid", !validateCreateOrder({ locationId: String(A), paymentMethod: "COD" }).error);
const onlineBad = validateCreateOrder({ locationId: String(A), paymentMethod: "ONLINE" });
ok("ONLINE order reject hota hai (D5)", !!onlineBad.error);

console.log(`\n${"=".repeat(64)}`);
console.log(`  PASS: ${pass}    FAIL: ${fail}`);
console.log("=".repeat(64));
process.exit(fail ? 1 : 0);
