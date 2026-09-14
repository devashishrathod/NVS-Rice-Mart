/* eslint-disable no-console */
/** Phase 3 verification — koi DB connection nahi. */
process.env.JWT_SECRET = process.env.JWT_SECRET || "test";
const mongoose = require("mongoose");

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

// ═══════════════════════════════════════════════════════════
hr("Cart model");
const Cart = require("../models/Cart");
const p = (path) => Cart.schema.path(path);

ok("cart.vendorId field", !!p("vendorId"));
ok("cart.deliveryZipcode field", !!p("deliveryZipcode"));
ok("cart.verifiedAt field", !!p("verifiedAt"));
ok("cart.verifiedAt default null", p("verifiedAt").defaultValue === null);
ok(
  "🗑️ items[].vendorId hata diya (cart level pe hai — duplication tha)",
  !Cart.schema.path("items").schema.path("vendorId"),
);
ok("cart.vendorId (cart level) abhi bhi hai", !!Cart.schema.path("vendorId"));
ok(
  "items[].resolvedPincode",
  !!Cart.schema.path("items").schema.path("resolvedPincode"),
);
ok(
  "{ userId, isPurchased, isDeleted } index",
  Cart.schema.indexes().some(([k]) => JSON.stringify(k).includes('"isPurchased":1')),
);

// pre-save hook: khali cart pe totals bhi reset hon
const c = new Cart({ userId: new mongoose.Types.ObjectId(), items: [] });
c.subTotal = 500;
c.totalWeight = 26;
c.totalQuantity = 1;
Cart.schema.s.hooks.execPre("save", c, () => {});
ok(
  "khali cart pe pre-save totals reset karta hai",
  c.subTotal === 0 && c.totalWeight === 0 && c.totalQuantity === 0,
);
ok("...aur isDeleted true", c.isDeleted === true);

// ═══════════════════════════════════════════════════════════
hr("recalcCartTotals — ek hi jagah se calculation");
const { recalcCartTotals } = require("../services/carts/recalcCartTotals");

let cart = {
  items: [
    { quantity: 2, priceSnapshot: 1600, productWeight: 26 },
    { quantity: 1, priceSnapshot: 800, productWeight: 10 },
  ],
};
recalcCartTotals(cart);
ok(`subTotal = 2×1600 + 1×800 = 4000 (got ${cart.subTotal})`, cart.subTotal === 4000);
ok(`totalQuantity = 3 (got ${cart.totalQuantity})`, cart.totalQuantity === 3);
ok(`totalWeight = 2×26 + 1×10 = 62 (got ${cart.totalWeight})`, cart.totalWeight === 62);

cart = { items: [] };
recalcCartTotals(cart);
ok("khali cart → sab 0", cart.subTotal === 0 && cart.totalQuantity === 0 && cart.totalWeight === 0);

cart = { items: [{ quantity: "2", priceSnapshot: "1600", productWeight: null }] };
recalcCartTotals(cart);
ok("garbage values pe NaN nahi", Number.isFinite(cart.subTotal) && Number.isFinite(cart.totalWeight));

// ═══════════════════════════════════════════════════════════
hr("Validators");
const {
  validateVerifyCart,
  validateAddOrUpdateCart,
  validateRemoveFromCart,
} = require("../validator/carts");
const OID = new mongoose.Types.ObjectId().toString();

ok("verify: sirf locationId", !validateVerifyCart({ locationId: OID }).error);
ok("verify: sirf zipcode", !validateVerifyCart({ zipcode: "577004" }).error);
ok("verify: dono", !validateVerifyCart({ locationId: OID, zipcode: "577004" }).error);
ok("verify: dono me se koi nahi → error", !!validateVerifyCart({}).error);
ok("verify: galat pincode → error", !!validateVerifyCart({ zipcode: "12" }).error);
ok(
  "verify: galat locationId → error",
  !!validateVerifyCart({ locationId: "abc", zipcode: "577004" }).error,
);
ok("add: valid", !validateAddOrUpdateCart({ productId: OID, quantity: 1 }).error);
ok("add: quantity ke bina → error", !!validateAddOrUpdateCart({ productId: OID }).error);
ok("remove: action remove", !validateRemoveFromCart({ action: "remove" }).error);
ok("remove: action decrease", !validateRemoveFromCart({ action: "decrease" }).error);
ok("remove: galat action → error", !!validateRemoveFromCart({ action: "delete" }).error);

// ═══════════════════════════════════════════════════════════
hr("Service signatures");
const carts = require("../services/carts");
// NOTE: Function.length pehle default param tak hi ginta hai, isliye
// `(userId, payload, options = {})` ka length 2 hai — source se check karo.
ok(
  "addOrUpdateItem(userId, payload, options)",
  /addOrUpdateItem\s*=\s*async\s*\(userId,\s*payload,\s*options/.test(
    require("fs").readFileSync(
      require("path").join(__dirname, "../services/carts/addOrUpdateItems.js"),
      "utf8",
    ),
  ),
);
ok("verifyCartByPincode(userId, payload)", carts.verifyCartByPincode.length === 2);
ok("getCart(userId)", carts.getCart.length === 1);
ok("recalcCartTotals exported", typeof carts.recalcCartTotals === "function");

// ═══════════════════════════════════════════════════════════
hr("Route guards");
const MW = require("../middlewares");
const NAME = new Map([
  [MW.verifyJwtToken, "verifyJwtToken"],
  [MW.isUser, "isUser"],
  [MW.attachServiceContext, "attachServiceContext"],
]);
const cartRouter = require("../routes/carts");
const routes = (cartRouter.stack || [])
  .filter((l) => l.route)
  .map((l) => ({
    method: Object.keys(l.route.methods)[0]?.toUpperCase(),
    path: `/carts${l.route.path}`,
    mws: l.route.stack.map((s) => NAME.get(s.handle)).filter(Boolean),
  }));

const g = (method, path, mw) => {
  const r = routes.find((x) => x.method === method && x.path === path);
  if (!r) return ok(`${method} ${path}`, false, "ROUTE NOT FOUND");
  ok(`${method} ${path} → ${mw}`, r.mws.includes(mw), `got [${r.mws.join(", ")}]`);
};
g("POST", "/carts/add-or-update", "isUser");
g("POST", "/carts/add-or-update", "attachServiceContext");
g("PUT", "/carts/remove/:productId", "isUser");
g("GET", "/carts/get", "isUser");
g("DELETE", "/carts/clear", "isUser");
g("POST", "/carts/verify-delivery", "isUser");
ok(
  "saare cart routes isUser ke peeche (vendor/admin ka cart nahi hota)",
  routes.every((r) => r.mws.includes("isUser")),
  routes.filter((r) => !r.mws.includes("isUser")).map((r) => r.path).join(", "),
);

// ═══════════════════════════════════════════════════════════
hr("IDOR fixes");
const fs = require("fs");
const path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
// comments hata ke padho — warna "// pehle product.stockQuantity += ..." jaise
// explanatory comments false positive de dete hain
const readCode = (f) =>
  read(f)
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
ok(
  "carts/get se ?userId= hata diya",
  !/req\.query\?\.userId/.test(read("controllers/carts/get.js")),
);
ok(
  "removeItem Product.stockQuantity ko touch nahi karta",
  !/product\.stockQuantity\s*[+-]?=/.test(
    readCode("services/carts/removeItem.js"),
  ),
);
ok(
  "...aur product.save() bhi nahi karta",
  !/product\.save\(/.test(readCode("services/carts/removeItem.js")),
);
ok(
  "getCart priceSnapshot blindly overwrite nahi karta",
  read("services/carts/getCart.js").includes("verifiedAt = null"),
);
ok(
  "addOrUpdateItem me N+1 nahi (single $in query)",
  read("services/carts/addOrUpdateItems.js").includes("_id: { $in: ids }"),
);
ok(
  "verifyCartByPincode ab VendorServiceArea use karta hai",
  read("services/carts/verifyCartByPincode.js").includes("VendorServiceArea"),
);
ok(
  "verifyCartByPincode ab ProductLocation use NAHI karta (D3)",
  !read("services/carts/verifyCartByPincode.js").includes("ProductLocation"),
);

// ═══════════════════════════════════════════════════════════
hr("Error codes");
const { ERROR_CODES } = require("../constants");
["CART_VENDOR_CONFLICT", "VENDOR_NOT_SERVICEABLE", "MIN_ORDER_NOT_MET", "PINCODE_REQUIRED"].forEach(
  (k) => ok(`ERROR_CODES.${k}`, !!ERROR_CODES[k]),
);

console.log(`\n${"=".repeat(64)}`);
console.log(`  PASS: ${pass}    FAIL: ${fail}`);
console.log("=".repeat(64));
process.exit(fail ? 1 : 0);
