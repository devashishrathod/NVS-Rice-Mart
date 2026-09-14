/* eslint-disable no-console */
/** Phase 4 (checkout) + Phase 5 (vendor order mgmt) verification. No DB. */
process.env.JWT_SECRET = process.env.JWT_SECRET || "test";
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

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
const hr = (t) =>
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}`);
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

const { ORDER_STATUS, ROLES, ERROR_CODES } = require("../constants");
const S = ORDER_STATUS;

// ═══════════════════════════════════════════════════════════
hr("Order model — Phase 4 fields");
const Order = require("../models/Order");
const op = (p) => Order.schema.path(p);
const itemSchema = Order.schema.path("items").schema;

[
  "vendorId",
  "vendorLocationId",
  "orderNumber",
  "deliveryPincode",
  "statusHistory",
  "cancelReason",
  "deliveredAt",
  "assignedTo",
  "assignedAt",
].forEach((f) => ok(`order.${f}`, !!op(f)));

ok("items[].productSnapshot.name", !!itemSchema.path("productSnapshot.name"));
ok("🗑️ items[].locationId hata diya", !itemSchema.path("locationId"));
ok(
  "🗑️ items[].vendorId hata diya (order level pe hai — duplication tha)",
  !itemSchema.path("vendorId"),
);
ok("order.vendorId (order level) abhi bhi hai", !!op("vendorId"));
ok("🗑️ Order.expectedDeliveryAt hata diya", !op("expectedDeliveryAt"));
ok(
  "item ka final shape = productId + quantity + price + productSnapshot",
  ["productId", "quantity", "price", "productSnapshot.name"].every((p) =>
    itemSchema.path(p),
  ) && !itemSchema.path("vendorId") && !itemSchema.path("locationId"),
);
ok("assignedTo default null (D11 — abhi koi rider nahi)", op("assignedTo").defaultValue === null);
ok(
  "{ vendorId, status, createdAt } index",
  Order.schema.indexes().some(([k]) => JSON.stringify(k).includes('"vendorId":1')),
);

hr("Counter (orderNumber ke liye)");
const Counter = require("../models/Counter");
ok("Counter model", !!Counter);
ok("Counter._id String hai", Counter.schema.path("_id").instance === "String");
ok(
  "generateOrderNumber atomic $inc use karta hai",
  /\$inc.*seq/s.test(read("helpers/orders/generateOrderNumber.js")) &&
    read("helpers/orders/generateOrderNumber.js").includes("findOneAndUpdate"),
);

// ═══════════════════════════════════════════════════════════
hr("State machine (D6 — admin read-only)");
const {
  canTransition,
  allowedNextStatuses,
  ALLOWED_TRANSITIONS,
} = require("../services/orders");

ok("PENDING → ACCEPTED (vendor)", canTransition(S.PENDING, S.ACCEPTED, ROLES.VENDOR));
ok("PENDING → REJECTED (vendor)", canTransition(S.PENDING, S.REJECTED, ROLES.VENDOR));
ok("ACCEPTED → PACKED (vendor)", canTransition(S.ACCEPTED, S.PACKED, ROLES.VENDOR));
ok("PACKED → OUT_FOR_DELIVERY (vendor)", canTransition(S.PACKED, S.OUT_FOR_DELIVERY, ROLES.VENDOR));
ok("OUT_FOR_DELIVERY → DELIVERED (vendor)", canTransition(S.OUT_FOR_DELIVERY, S.DELIVERED, ROLES.VENDOR));
ok("PENDING → CANCELLED (customer)", canTransition(S.PENDING, S.CANCELLED, ROLES.USER));
ok("ACCEPTED → CANCELLED (customer)", canTransition(S.ACCEPTED, S.CANCELLED, ROLES.USER));

ok("❌ PACKED → CANCELLED (customer) allowed NAHI", !canTransition(S.PACKED, S.CANCELLED, ROLES.USER));
ok("❌ DELIVERED → PACKED allowed NAHI", !canTransition(S.DELIVERED, S.PACKED, ROLES.VENDOR));
ok("❌ PENDING → DELIVERED (skip) allowed NAHI", !canTransition(S.PENDING, S.DELIVERED, ROLES.VENDOR));
ok("❌ CANCELLED se kahin nahi", allowedNextStatuses(S.CANCELLED, ROLES.VENDOR).length === 0);
ok("❌ REJECTED se kahin nahi", allowedNextStatuses(S.REJECTED, ROLES.VENDOR).length === 0);
ok("❌ customer PACKED nahi kar sakta", !canTransition(S.ACCEPTED, S.PACKED, ROLES.USER));

const adminHasNoMoves = Object.values(ALLOWED_TRANSITIONS).every(
  (t) => t.admin.length === 0,
);
ok("🔒 D6 — ADMIN ka koi transition nahi (read-only)", adminHasNoMoves);
ok("admin PENDING→ACCEPTED nahi kar sakta", !canTransition(S.PENDING, S.ACCEPTED, ROLES.ADMIN));
ok("staff bhi nahi", !canTransition(S.PENDING, S.ACCEPTED, ROLES.STAFF));

hr("Restock statuses");
const { RESTOCK_STATUSES } = require("../services/orders/orderStateMachine");
ok("CANCELLED pe stock wapas", RESTOCK_STATUSES.has(S.CANCELLED));
ok("REJECTED pe stock wapas", RESTOCK_STATUSES.has(S.REJECTED));
ok("DELIVERED pe stock wapas NAHI", !RESTOCK_STATUSES.has(S.DELIVERED));

// ═══════════════════════════════════════════════════════════
hr("computeOrderPricing — shared calculation");
const pricingSrc = read("helpers/orders/computeOrderPricing.js");
ok("preview isi helper ko call karta hai", read("services/orders/previewOrder.js").includes("computeOrderPricing"));
ok("placeOrder bhi isi ko call karta hai", read("services/orders/placeOrder.js").includes("computeOrderPricing"));
ok("pickup = vendor ka DEFAULT branch (D10)", pricingSrc.includes("defaultLocationId"));
ok("VENDOR_BRANCH type check", pricingSrc.includes("LOCATION_TYPES.VENDOR_BRANCH"));
ok("radius global Setting se (D15/Q26-b)", pricingSrc.includes("maxRadiusKm"));
ok("VENDOR_PICKUP_MISSING error", pricingSrc.includes("VENDOR_PICKUP_MISSING"));
ok("OUT_OF_RADIUS error", pricingSrc.includes("OUT_OF_RADIUS"));
ok("MIN_ORDER_NOT_MET error", pricingSrc.includes("MIN_ORDER_NOT_MET"));
ok("STOCK_UNAVAILABLE error", pricingSrc.includes("STOCK_UNAVAILABLE"));
ok(
  "🔑 isEnabled MASTER SWITCH — off to charge ₹0",
  /let deliveryCharge = 0/.test(pricingSrc) &&
    pricingSrc.includes("chargeEnabled") &&
    pricingSrc.includes("delivery?.isEnabled === true") === false &&
    pricingSrc.includes("deliveryConf.isEnabled === true"),
);
ok(
  "...admin ka per-pincode override bhi isEnabled ke ANDAR hai",
  pricingSrc.indexOf("chargeEnabled") < pricingSrc.indexOf("deliveryChargeOverride !== undefined"),
);
ok("platform hard cap (maxAllowedDeliveryCharge) lagta hai",
  pricingSrc.includes("maxAllowedDeliveryCharge"));
ok("per-vendor maxRadiusKm, global se capped",
  pricingSrc.includes("Math.min(vendorRadius, globalRadius)"));
ok("freeDeliveryAbove support", pricingSrc.includes("freeDeliveryApplied"));
ok("free delivery bhi isEnabled ke andar", /chargeEnabled &&\s*freeAbove/.test(pricingSrc));
ok("price/stock `Product` se (D3), ProductLocation se nahi", !pricingSrc.includes("ProductLocation"));

hr("placeOrder");
const placeSrc = read("services/orders/placeOrder.js");
ok("sirf COD (D5)", placeSrc.includes("PAYMENT_METHODS.COD"));
ok("status PENDING (INITIATED nahi)", placeSrc.includes("ORDER_STATUS.PENDING"));
ok("cart verify hua? (CART_NOT_VERIFIED)", placeSrc.includes("CART_NOT_VERIFIED"));
ok("verified zipcode aur order address match hote hain", placeSrc.includes("deliveryZipcode"));
ok("stock guarded $inc se reserve", /stockQuantity:\s*\{\s*\$gte/.test(placeSrc));
ok("modifiedCount check", placeSrc.includes("modifiedCount"));
ok("stock `Product` pe (ProductLocation pe nahi)", !placeSrc.includes("ProductLocation"));
ok("transaction use karta hai", placeSrc.includes("startTransaction"));
ok("statusHistory seed karta hai", placeSrc.includes("statusHistory"));
ok(
  "notification transaction ke BAAHAR + catch me",
  /notifyOrderPlaced\(order\)\s*\.catch/s.test(placeSrc),
);
ok("razorpay import hata diya", !placeSrc.includes("Razorpay"));

// ═══════════════════════════════════════════════════════════
hr("Notifications — recipient aware, non-throwing");
const notifSrc = read("helpers/notifications/sendNotification.js");
ok("toUserId ko actually use karta hai", notifSrc.includes("findById(toUserId)"));
ok("admin ko hardcode NAHI karta", !notifSrc.includes("role: ROLES.ADMIN"));
ok("token missing pe throw nahi karta", notifSrc.includes("return false"));
ok("firebase init lazy + guarded", notifSrc.includes("initFirebase"));
const n = require("../helpers/notifications");
["sendNotification", "sendNotificationToMany", "notifyOrderPlaced", "notifyOrderStatusChanged"].forEach(
  (f) => ok(`notifications.${f} exported`, typeof n[f] === "function"),
);
ok("purana sendSingleNotification shim abhi bhi hai", typeof n.sendSingleNotification === "function");
ok(
  "purani sendSingleNotification.js file hata di",
  !fs.existsSync(path.join(__dirname, "../helpers/notifications/sendSingleNotification.js")),
);

// ═══════════════════════════════════════════════════════════
hr("Validators");
const {
  validateOrderPreview,
  validateUpdateOrderStatus,
  validateCancelOrder,
  validateCreateOrder,
} = require("../validator/orders");
const OID = new mongoose.Types.ObjectId().toString();

ok("preview: locationId required", !!validateOrderPreview({}).error);
ok("preview: valid", !validateOrderPreview({ locationId: OID }).error);
ok("status: valid", !validateUpdateOrderStatus({ status: "ACCEPTED" }).error);
ok("status: galat value → error", !!validateUpdateOrderStatus({ status: "SHIPPED" }).error);
ok("status: reason optional", !validateUpdateOrderStatus({ status: "REJECTED", reason: "no stock" }).error);
ok("cancel: khali body chalti hai", !validateCancelOrder({}).error);
ok("create: COD ok", !validateCreateOrder({ locationId: OID, paymentMethod: "COD" }).error);
ok("create: ONLINE reject", !!validateCreateOrder({ locationId: OID, paymentMethod: "ONLINE" }).error);

// ═══════════════════════════════════════════════════════════
hr("Routes");
const MW = require("../middlewares");
const NAME = new Map([
  [MW.verifyJwtToken, "verifyJwtToken"],
  [MW.isAdmin, "isAdmin"],
  [MW.isVendor, "isVendor"],
  [MW.isUser, "isUser"],
]);
const orderRouter = require("../routes/orders");
const routes = (orderRouter.stack || [])
  .filter((l) => l.route)
  .map((l) => ({
    method: Object.keys(l.route.methods)[0]?.toUpperCase(),
    path: `/orders${l.route.path}`,
    guards: l.route.stack.map((s) => NAME.get(s.handle)).filter(Boolean),
  }));
const g = (method, p, expected) => {
  const r = routes.find((x) => x.method === method && x.path === p);
  if (!r) return ok(`${method} ${p}`, false, "ROUTE NOT FOUND");
  ok(`${method} ${p} → ${expected}`, r.guards.includes(expected), `got [${r.guards.join(", ")}]`);
};
g("POST", "/orders/preview", "isUser");
g("POST", "/orders/create", "isUser");
g("PUT", "/orders/:id/cancel", "isUser");
g("GET", "/orders/getAll", "verifyJwtToken");
g("GET", "/orders/get/:id", "verifyJwtToken");
g("PUT", "/orders/:id/status", "isVendor");
g("GET", "/orders/vendor/summary", "isVendor");
g("GET", "/orders/admin/summary", "isAdmin");

ok(
  "⛔ purana blanket PUT /orders/update/:id hata diya",
  !routes.some((r) => r.path === "/orders/update/:id"),
);
ok(
  "⛔ /orders/verify-payment abhi bhi unmounted",
  !routes.some((r) => r.path.includes("verify-payment")),
);
ok("har order route guarded", routes.every((r) => r.guards.length > 0));
console.log(`     (order routes: ${routes.length})`);

hr("Aggregation — naye fields project hote hain?");
const { buildOrderPipeline } = require("../services/orders/orderAggregation");
const pipe = JSON.stringify(buildOrderPipeline({ match: {} }));
["vendorId", "orderNumber", "statusHistory", "cancelReason", "deliveredAt", "productSnapshot", "vendorprofiles"].forEach(
  (f) => ok(`pipeline me ${f}`, pipe.includes(f)),
);
ok("items[].locationId project nahi hota", !pipe.includes('"$$it.locationId"'));

hr("Error codes");
["CART_NOT_VERIFIED", "INVALID_STATUS_TRANSITION", "STOCK_UNAVAILABLE", "VENDOR_PICKUP_MISSING", "OUT_OF_RADIUS", "MIN_ORDER_NOT_MET"].forEach(
  (k) => ok(`ERROR_CODES.${k}`, !!ERROR_CODES[k]),
);

console.log(`\n${"=".repeat(64)}`);
console.log(`  PASS: ${pass}    FAIL: ${fail}`);
console.log("=".repeat(64));
process.exit(fail ? 1 : 0);
