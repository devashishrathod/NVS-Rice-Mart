/* eslint-disable no-console */
/**
 * END-TO-END FLOW TEST — login se lekar delivery tak, real HTTP calls.
 *
 *   node scripts/e2e-flow-test.js
 *   node scripts/e2e-flow-test.js --keep     # cleanup skip karo (debug ke liye)
 *
 * - Apna express server in-process start karta hai (routes + middlewares +
 *   controllers + services + DB — sab asli).
 * - Apna hi isolated test data banata hai (`e2e-<runId>` prefix), migration
 *   ki zaroorat nahi.
 * - Aakhir me sab kuch delete kar deta hai.
 *
 * 🔒 PROD DB pe chalne se mana karta hai.
 */
require("dotenv").config();
const express = require("express");
const fileUpload = require("express-fileupload");
const mongoose = require("mongoose");

const { errorHandler } = require("../middlewares");
const { throwError } = require("../utils");

const KEEP = process.argv.includes("--keep");
// Numeric run id — mobile numbers isi se bante hain, aur `Joi.email()` real
// TLD maangta hai isliye domain `.com` rakha hai.
const runId = String(Date.now()).slice(-9);
const TAG = `e2e${runId}`;
const MAIL = (who) => `${TAG}-${who}@e2e-test.com`;
const MOBILE = (prefix) => `${prefix}${runId.slice(-9).padStart(9, "0")}`;

// ─────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const failures = [];
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push(`${name} — ${extra}`);
    console.log(`  ❌ ${name}  ${extra}`);
  }
};
const hr = (t) => console.log(`\n${"─".repeat(74)}\n  ${t}\n${"─".repeat(74)}`);

let BASE;
const call = async (method, path, { token, body, raw } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  if (raw) return { status: res.status, json };
  return { status: res.status, ...json };
};

const CREATED = {
  users: [],
  locations: [],
  categories: [],
  subcategories: [],
  products: [],
  carts: [],
  orders: [],
  vendorprofiles: [],
  vendorserviceareas: [],
};

// ═════════════════════════════════════════════════════════════
const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const dbName = mongoose.connection.name;
  if (/prod/i.test(dbName)) {
    throw new Error(
      `ABORT: ye PRODUCTION DB hai (${dbName}). E2E test sirf stage/local pe chalao.`,
    );
  }
  console.log(`\n🧪 E2E FLOW TEST   DB: ${dbName}   run: ${TAG}\n`);

  // ── App start ──────────────────────────────────────────────
  const app = express();
  app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));
  app.use(express.json());
  app.use("/nvs-rice-mart/", require("../routes"));
  app.use(() => throwError(404, "Invalid API"));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  BASE = `http://127.0.0.1:${server.address().port}/nvs-rice-mart`;

  const User = require("../models/User");
  const Product = require("../models/Product");
  const Cart = require("../models/Cart");
  const Order = require("../models/Order");
  const { ROLES } = require("../constants");

  const PW = "Test@12345";
  const ZIP_OK = "560001";
  const ZIP_OK2 = "560002";
  const ZIP_BAD = "110001";

  try {
    // ══════════════════════════════════════════════════════════
    hr("1. SETUP — admin (seedha DB me, kyunki public register ab sirf customer banata hai)");
    const admin = await User.create({
      name: `${TAG}-admin`,
      email: MAIL("admin"),
      password: PW,
      role: ROLES.ADMIN,
      isActive: true,
    });
    CREATED.users.push(admin._id);
    ok("admin banaya", !!admin._id);

    let r = await call("POST", "/auth/login", {
      body: { type: "email", email: admin.email, password: PW, role: "admin" },
    });
    const adminToken = r.data?.token;
    ok("admin login → token", !!adminToken, `status ${r.status} ${r.message}`);

    // ══════════════════════════════════════════════════════════
    hr("2. ADMIN — vendor onboarding");
    r = await call("POST", "/vendors/create", {
      token: adminToken,
      body: {
        shopName: `${TAG} Mart`,
        email: MAIL("vendor"),
        mobile: MOBILE("9"),
        password: PW,
        branch: {
          name: "main",
          address: "e2e test road",
          city: "bengaluru",
          district: "bengaluru urban",
          state: "karnataka",
          zipcode: ZIP_OK,
          coordinates: [12.9716, 77.5946],
        },
      },
    });
    ok("POST /vendors/create → 201", r.status === 201, `${r.status} ${r.message}`);
    const vendorId = r.data?.vendor?._id;
    const branchId = r.data?.branch?._id;
    if (vendorId) CREATED.users.push(vendorId);
    if (r.data?.profile?._id) CREATED.vendorprofiles.push(r.data.profile._id);
    if (branchId) CREATED.locations.push(branchId);
    ok("pehla branch apne aap isDefault", r.data?.branch?.isDefault === true);
    ok("branch type VENDOR_BRANCH", r.data?.branch?.type === "VENDOR_BRANCH");
    ok("profile.defaultLocationId set", String(r.data?.profile?.defaultLocationId) === String(branchId));
    ok("🔑 naya vendor: delivery.isEnabled false (→ charge ₹0)",
      r.data?.profile?.delivery?.isEnabled === false,
      JSON.stringify(r.data?.profile?.delivery));
    ok("naya vendor: values pehle se bhari hain (baseCharge 30)",
      r.data?.profile?.delivery?.baseCharge === 30,
      `mila ${r.data?.profile?.delivery?.baseCharge}`);
    ok("naya vendor: perKmRate 5, perKgRate 1.5, minDeliveryCharge 40",
      r.data?.profile?.delivery?.perKmRate === 5 &&
        r.data?.profile?.delivery?.perKgRate === 1.5 &&
        r.data?.profile?.delivery?.minDeliveryCharge === 40);
    ok("naya vendor: freeDeliveryAbove null (0 hota to sab free)",
      r.data?.profile?.delivery?.freeDeliveryAbove === null);

    r = await call("POST", "/auth/login", {
      body: { type: "email", email: MAIL("vendor"), password: PW, role: "vendor" },
    });
    const vendorToken = r.data?.token;
    ok("vendor login → token", !!vendorToken, `${r.status} ${r.message}`);

    // ── service areas ────────────────────────────────────────
    r = await call("POST", `/vendors/${vendorId}/service-areas`, {
      token: adminToken,
      body: {
        locationId: branchId,
        areas: [{ zipcode: ZIP_OK }, { zipcode: ZIP_OK2 }],
      },
    });
    ok("service areas add → 201", r.status === 201, `${r.status} ${r.message}`);
    ok("2 areas created", r.data?.created === 2, JSON.stringify(r.data));
    (r.data?.areas || []).forEach((a) => CREATED.vendorserviceareas.push(a._id));

    r = await call("GET", `/service-areas/lookup?zipcode=${ZIP_OK}`, { token: adminToken });
    ok("lookup → assigned", r.data?.assigned === true && String(r.data?.vendor?.id) === String(vendorId));

    // ── D1: exclusive territory ──────────────────────────────
    r = await call("POST", "/vendors/create", {
      token: adminToken,
      body: {
        shopName: `${TAG} Rival`,
        email: MAIL("rival"),
        password: PW,
        branch: {
          address: "rival road", city: "bengaluru", district: "bengaluru urban",
          state: "karnataka", zipcode: ZIP_OK2, coordinates: [12.98, 77.6],
        },
      },
    });
    const rivalId = r.data?.vendor?._id;
    const rivalBranch = r.data?.branch?._id;
    if (rivalId) CREATED.users.push(rivalId);
    if (r.data?.profile?._id) CREATED.vendorprofiles.push(r.data.profile._id);
    if (rivalBranch) CREATED.locations.push(rivalBranch);
    ok("doosra vendor bana", !!rivalId);

    r = await call("POST", `/vendors/${rivalId}/service-areas`, {
      token: adminToken,
      body: { locationId: rivalBranch, areas: [{ zipcode: ZIP_OK2 }, { zipcode: "560003" }] },
    });
    ok("🔒 D1 — taken pincode pe 409", r.status === 409, `${r.status} ${r.message}`);
    ok("...code PINCODE_ALREADY_ASSIGNED", r.code === "PINCODE_ALREADY_ASSIGNED");
    ok("...conflicts me shopName", !!r.error?.conflicts?.[0]?.shopName, JSON.stringify(r.error));
    const saCountAfter = await mongoose.connection
      .collection("vendorserviceareas")
      .countDocuments({ vendorId: new mongoose.Types.ObjectId(rivalId), isDeleted: false });
    ok("🔒 all-or-nothing — 560003 bhi nahi bana", saCountAfter === 0, `mila ${saCountAfter}`);

    // ══════════════════════════════════════════════════════════
    hr("3. VENDOR — catalog");
    r = await call("POST", "/categories/create", {
      token: vendorToken,
      body: { name: `${TAG} rice`, description: "e2e" },
    });
    ok("category create → 201", r.status === 201, `${r.status} ${r.message}`);
    const catId = r.data?._id;
    if (catId) CREATED.categories.push(catId);
    ok("category ka userId = vendor", String(r.data?.userId) === String(vendorId));

    r = await call("POST", `/subCategories/${catId}/create`, {
      token: vendorToken,
      body: { name: `${TAG} steam`, description: "e2e" },
    });
    ok("subcategory create → 201", r.status === 201, `${r.status} ${r.message}`);
    const subId = r.data?._id;
    if (subId) CREATED.subcategories.push(subId);

    r = await call("POST", "/products/create", {
      token: vendorToken,
      body: {
        name: `${TAG} bag`, brand: `${TAG} brand`, subCategoryId: subId,
        generalPrice: 1000, stockQuantity: 5, weightInKg: 26, isActive: true,
      },
    });
    ok("product create → 201", r.status === 201, `${r.status} ${r.message}`);
    const prodId = r.data?._id;
    if (prodId) CREATED.products.push(prodId);
    ok("product ka userId = vendor", String(r.data?.userId) === String(vendorId));

    // cross-vendor guard
    r = await call("POST", "/auth/login", {
      body: { type: "email", email: MAIL("rival"), password: PW, role: "vendor" },
    });
    const rivalToken = r.data?.token;
    r = await call("POST", `/subCategories/${catId}/create`, {
      token: rivalToken, body: { name: "hijack", description: "x" },
    });
    ok("🔒 doosre vendor ki category me subcat → 403", r.status === 403, `${r.status} ${r.message}`);

    r = await call("PUT", `/products/update/${prodId}`, {
      token: rivalToken, body: { generalPrice: 1 },
    });
    ok("🔒 doosre vendor ka product update → 403", r.status === 403, `${r.status} ${r.message}`);

    // ══════════════════════════════════════════════════════════
    hr("4. CUSTOMER — signup & address");
    r = await call("POST", "/auth/register", {
      body: {
        name: `${TAG}-cust`, email: MAIL("cust"),
        password: PW, mobile: MOBILE("8"),
        role: "admin", // 🔒 ignore hona chahiye
      },
    });
    ok("customer register → 201", r.status === 201, `${r.status} ${r.message}`);
    const custId = r.data?.user?._id;
    let custToken = r.data?.token;
    if (custId) CREATED.users.push(custId);
    ok("🔒 role escalation block — role 'user' hi bana", r.data?.user?.role === "user", `mila ${r.data?.user?.role}`);

    // address ke bina listing
    r = await call("GET", "/categories/getAll", { token: custToken });
    ok("address ke bina listing → 400", r.status === 400, `${r.status} ${r.message}`);
    ok("...code PINCODE_REQUIRED", r.code === "PINCODE_REQUIRED", r.code);

    r = await call("GET", `/service-areas/check?zipcode=${ZIP_BAD}`, { token: custToken });
    ok("serviceability bad pincode → 404", r.status === 404, `${r.status}`);
    ok("...code PINCODE_NOT_SERVICEABLE", r.code === "PINCODE_NOT_SERVICEABLE");

    r = await call("GET", `/service-areas/check?zipcode=${ZIP_OK}`, { token: custToken });
    ok("serviceability good pincode → 200", r.status === 200, `${r.status} ${r.message}`);
    ok("...shopName aaya", r.data?.vendor?.shopName === `${TAG} Mart`, JSON.stringify(r.data?.vendor));

    r = await call("POST", "/locations/create", {
      token: custToken,
      body: {
        name: "home", address: "e2e customer street", city: "bengaluru",
        district: "bengaluru urban", state: "karnataka", zipcode: ZIP_OK,
        coordinates: [12.9756, 77.5996],
      },
    });
    ok("address create → 201", r.status === 201, `${r.status} ${r.message}`);
    const addrId = r.data?._id;
    if (addrId) CREATED.locations.push(addrId);
    ok("pehla address apne aap isDefault", r.data?.isDefault === true);
    ok("type CUSTOMER", r.data?.type === "CUSTOMER");

    const custDoc = await User.findById(custId).select("locationId").lean();
    ok("user.locationId sync hua", String(custDoc?.locationId) === String(addrId));

    // dusra address + set-default
    r = await call("POST", "/locations/create", {
      token: custToken,
      body: {
        name: "office", address: "e2e office street", city: "bengaluru",
        district: "bengaluru urban", state: "karnataka", zipcode: ZIP_OK2,
        coordinates: [12.99, 77.61],
      },
    });
    const addr2Id = r.data?._id;
    if (addr2Id) CREATED.locations.push(addr2Id);
    ok("dusra address bana, default nahi", r.data?.isDefault === false, JSON.stringify(r.data?.isDefault));

    r = await call("PUT", `/locations/set-default/${addr2Id}`, { token: custToken });
    ok("set-default → 200", r.status === 200, `${r.status} ${r.message}`);
    const defaults = await mongoose.connection.collection("locations").countDocuments({
      userId: new mongoose.Types.ObjectId(custId), isDeleted: false, isDefault: true,
    });
    ok("🔒 sirf EK default (invariant)", defaults === 1, `mile ${defaults}`);

    r = await call("PUT", `/locations/set-default/${addrId}`, { token: custToken });
    ok("wapas pehle address ko default", r.status === 200);

    // ══════════════════════════════════════════════════════════
    hr("5. CUSTOMER — listing (pincode scoped)");
    r = await call("GET", "/categories/getAll", { token: custToken });
    ok("categories → 200", r.status === 200, `${r.status} ${r.message}`);
    const catIds = (r.data?.data || []).map((c) => String(c._id));
    ok("apni category dikhi", catIds.includes(String(catId)));
    ok("sirf apne vendor ki", (r.data?.data || []).every((c) => String(c.userId) === String(vendorId)));

    r = await call("GET", `/products/getAll?subCategoryId=${subId}`, { token: custToken });
    ok("products → 200", r.status === 200);
    ok("apna product dikha", (r.data?.data || []).some((p) => String(p._id) === String(prodId)));

    r = await call("GET", `/products/get/${prodId}`, { token: custToken });
    ok("product detail → 200", r.status === 200, `${r.status} ${r.message}`);

    // non-serviceable pincode
    r = await call("GET", `/products/getAll?zipcode=${ZIP_BAD}`, { token: custToken });
    ok("non-serviceable pincode pe listing → 404", r.status === 404, `${r.status}`);
    ok("...code PINCODE_NOT_SERVICEABLE", r.code === "PINCODE_NOT_SERVICEABLE");

    // khali result = 200, 404 nahi
    r = await call("GET", `/products/getAll?search=zzz-nothing-${runId}`, { token: custToken });
    ok("khali list → 200 (404 nahi)", r.status === 200, `${r.status}`);
    ok("...data [] aur total 0", Array.isArray(r.data?.data) && r.data.total === 0);

    // 🔒 userId param override
    r = await call("GET", `/products/getAll?userId=${rivalId}`, { token: custToken });
    ok("🔒 ?userId= se dusre vendor ka catalog NAHI", r.status === 200 && (r.data?.data || []).every((p) => String(p.userId) === String(vendorId)));

    // ══════════════════════════════════════════════════════════
    hr("6. CUSTOMER — cart");
    r = await call("POST", "/carts/add-or-update", {
      token: custToken, body: { productId: prodId, quantity: 2 },
    });
    ok("add to cart → 201", r.status === 201, `${r.status} ${r.message}`);
    if (r.data?._id) CREATED.carts.push(r.data._id);
    ok("cart.vendorId set", String(r.data?.vendorId) === String(vendorId));
    ok("verifiedAt null", r.data?.verifiedAt === null);
    ok("subTotal 2000", r.data?.subTotal === 2000, `mila ${r.data?.subTotal}`);
    ok("totalWeight 52", r.data?.totalWeight === 52, `mila ${r.data?.totalWeight}`);

    r = await call("GET", "/carts/get", { token: custToken });
    ok("get cart → 200", r.status === 200, `${r.status} ${r.message}`);
    ok("item me product details aaye", !!r.data?.items?.[0]?.product?.name);
    ok("vendor info aaya", r.data?.vendor?.shopName === `${TAG} Mart`);

    // stock abhi tak nahi ghata
    let p = await Product.findById(prodId).select("stockQuantity").lean();
    ok("🔒 cart me daalne se stock NAHI ghata", p.stockQuantity === 5, `mila ${p.stockQuantity}`);

    // cart vendor conflict
    const rivalProd = await Product.create({
      userId: rivalId, categoryId: catId, subCategoryId: subId,
      name: `${TAG} rival bag`, brand: `${TAG} rb`, generalPrice: 900,
      stockQuantity: 5, SKU: `${TAG}-RIVAL`, weightInKg: 10, isActive: true,
    });
    CREATED.products.push(rivalProd._id);
    r = await call("POST", "/carts/add-or-update", {
      token: custToken, body: { productId: rivalProd._id, quantity: 1 },
    });
    ok("dusre vendor ka product (area me nahi) → 404", r.status === 404, `${r.status} ${r.message}`);
    ok("...code PRODUCT_NOT_AVAILABLE_HERE", r.code === "PRODUCT_NOT_AVAILABLE_HERE", r.code);

    // ══════════════════════════════════════════════════════════
    hr("7. CUSTOMER — verify → preview → order");
    r = await call("POST", "/orders/create", {
      token: custToken, body: { locationId: addrId, paymentMethod: "COD" },
    });
    ok("bina verify order → 400", r.status === 400, `${r.status} ${r.message}`);
    ok("...code CART_NOT_VERIFIED", r.code === "CART_NOT_VERIFIED", r.code);

    r = await call("POST", "/orders/create", {
      token: custToken, body: { locationId: addrId, paymentMethod: "ONLINE" },
    });
    ok("🔒 ONLINE payment → 422 (D5)", r.status === 422, `${r.status} ${r.message}`);

    r = await call("POST", "/carts/verify-delivery", {
      token: custToken, body: { locationId: addrId },
    });
    ok("verify-delivery → 200", r.status === 200, `${r.status} ${r.message}`);
    ok("status OK", r.data?.status === "OK", JSON.stringify(r.data));
    ok("zipcode resolve hua", r.data?.zipcode === ZIP_OK);

    r = await call("POST", "/orders/preview", {
      token: custToken, body: { locationId: addrId },
    });
    ok("preview → 200", r.status === 200, `${r.status} ${r.message}`);
    const preview = r.data;
    ok("subTotal 2000", preview?.subTotal === 2000, `mila ${preview?.subTotal}`);
    ok("deliveryCharge 0 (config khali — D15)", preview?.deliveryCharge === 0, `mila ${preview?.deliveryCharge}`);
    ok("payableAmount = subTotal", preview?.payableAmount === preview?.subTotal);
    ok("distanceKm > 0", preview?.distanceKm > 0, `mila ${preview?.distanceKm}`);
    ok("paymentMethods ['COD']", JSON.stringify(preview?.paymentMethods) === '["COD"]');

    r = await call("POST", "/orders/create", {
      token: custToken, body: { locationId: addrId, paymentMethod: "COD" },
    });
    ok("order create → 201", r.status === 201, `${r.status} ${r.message}`);
    const orderId = r.data?.orderId;
    if (orderId) CREATED.orders.push(orderId);
    ok("status PENDING (INITIATED nahi)", r.data?.status === "PENDING", r.data?.status);
    ok("orderNumber mila", /^NVS-\d{4}-\d{6}$/.test(r.data?.orderNumber || ""), r.data?.orderNumber);
    ok("🔑 preview ka total == order ka total", r.data?.payableAmount === preview?.payableAmount);

    p = await Product.findById(prodId).select("stockQuantity").lean();
    ok("stock 5 → 3 (order pe ghata)", p.stockQuantity === 3, `mila ${p.stockQuantity}`);

    const cartAfter = await Cart.findOne({ userId: custId, isPurchased: true }).lean();
    ok("cart purchased mark hua", !!cartAfter);

    r = await call("GET", "/carts/get", { token: custToken });
    ok("order ke baad cart khali → 404", r.status === 404, `${r.status}`);

    // ══════════════════════════════════════════════════════════
    hr("8. ORDER visibility & scoping");
    r = await call("GET", `/orders/get/${orderId}`, { token: custToken });
    ok("customer apna order dekh sakta hai", r.status === 200, `${r.status} ${r.message}`);
    ok("vendor info aaya", r.data?.vendor?.shopName === `${TAG} Mart`);
    ok("pickupLocation aaya", !!r.data?.pickupLocation?.zipcode);
    ok("statusHistory seed hua", r.data?.statusHistory?.length === 1, JSON.stringify(r.data?.statusHistory));
    ok("productSnapshot save hua", !!r.data?.items?.[0]?.productSnapshot?.name);
    ok("deliveryPincode set", r.data?.deliveryPincode === ZIP_OK);

    r = await call("GET", `/orders/get/${orderId}`, { token: rivalToken });
    ok("🔒 dusre vendor ko order → 404", r.status === 404, `${r.status}`);

    r = await call("GET", "/orders/getAll", { token: vendorToken });
    ok("vendor ko apna order dikha", r.status === 200 && (r.data?.data || []).some((o) => String(o._id) === String(orderId)));

    r = await call("GET", "/orders/getAll", { token: rivalToken });
    ok("🔒 rival vendor ko wo order nahi", !(r.data?.data || []).some((o) => String(o._id) === String(orderId)));

    r = await call("GET", "/orders/vendor/summary", { token: vendorToken });
    ok("vendor summary → 200", r.status === 200, `${r.status} ${r.message}`);
    ok("pending 1", r.data?.pending === 1, JSON.stringify(r.data));

    r = await call("GET", "/orders/admin/summary", { token: adminToken });
    ok("admin summary → 200", r.status === 200, `${r.status} ${r.message}`);

    // ══════════════════════════════════════════════════════════
    hr("9. VENDOR — status flow (PENDING → DELIVERED)");
    r = await call("PUT", `/orders/${orderId}/status`, {
      token: adminToken, body: { status: "ACCEPTED" },
    });
    ok("🔒 D6 — admin status change → 403", r.status === 403, `${r.status} ${r.message}`);

    r = await call("PUT", `/orders/${orderId}/status`, {
      token: vendorToken, body: { status: "DELIVERED" },
    });
    ok("🔒 skip transition (PENDING→DELIVERED) → 422", r.status === 422, `${r.status} ${r.message}`);
    ok("...code INVALID_STATUS_TRANSITION", r.code === "INVALID_STATUS_TRANSITION");
    ok("...error.allowed batata hai", Array.isArray(r.error?.allowed), JSON.stringify(r.error));

    r = await call("PUT", `/orders/${orderId}/status`, {
      token: rivalToken, body: { status: "ACCEPTED" },
    });
    ok("🔒 dusre vendor se status change → 404", r.status === 404, `${r.status}`);

    for (const st of ["ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      r = await call("PUT", `/orders/${orderId}/status`, {
        token: vendorToken, body: { status: st },
      });
      ok(`vendor → ${st}`, r.status === 200 && r.data?.status === st, `${r.status} ${r.message}`);
    }

    r = await call("GET", `/orders/get/${orderId}`, { token: custToken });
    ok("statusHistory me 5 entries", r.data?.statusHistory?.length === 5, `mila ${r.data?.statusHistory?.length}`);
    ok("deliveredAt set", !!r.data?.deliveredAt);

    r = await call("PUT", `/orders/${orderId}/cancel`, { token: custToken, body: { reason: "late" } });
    ok("🔒 DELIVERED ke baad cancel → 422", r.status === 422, `${r.status} ${r.message}`);

    p = await Product.findById(prodId).select("stockQuantity").lean();
    ok("deliver ke baad stock 3 hi (restock nahi hua)", p.stockQuantity === 3, `mila ${p.stockQuantity}`);

    // ══════════════════════════════════════════════════════════
    hr("10. CANCEL flow — stock restore");
    r = await call("POST", "/carts/add-or-update", { token: custToken, body: { productId: prodId, quantity: 1 } });
    if (r.data?._id) CREATED.carts.push(r.data._id);
    await call("POST", "/carts/verify-delivery", { token: custToken, body: { locationId: addrId } });
    r = await call("POST", "/orders/create", { token: custToken, body: { locationId: addrId, paymentMethod: "COD" } });
    const order2 = r.data?.orderId;
    if (order2) CREATED.orders.push(order2);
    ok("dusra order bana", r.status === 201, `${r.status} ${r.message}`);

    p = await Product.findById(prodId).select("stockQuantity").lean();
    ok("stock 3 → 2", p.stockQuantity === 2, `mila ${p.stockQuantity}`);

    r = await call("PUT", `/orders/${order2}/cancel`, { token: custToken, body: { reason: "e2e cancel" } });
    ok("customer cancel → 200", r.status === 200, `${r.status} ${r.message}`);
    ok("status CANCELLED", r.data?.status === "CANCELLED");
    ok("cancelReason save hua", r.data?.cancelReason === "e2e cancel");

    p = await Product.findById(prodId).select("stockQuantity").lean();
    ok("🔑 cancel pe stock wapas (2 → 3)", p.stockQuantity === 3, `mila ${p.stockQuantity}`);

    // ── reject flow ──────────────────────────────────────────
    r = await call("POST", "/carts/add-or-update", { token: custToken, body: { productId: prodId, quantity: 1 } });
    if (r.data?._id) CREATED.carts.push(r.data._id);
    await call("POST", "/carts/verify-delivery", { token: custToken, body: { locationId: addrId } });
    r = await call("POST", "/orders/create", { token: custToken, body: { locationId: addrId, paymentMethod: "COD" } });
    const order3 = r.data?.orderId;
    if (order3) CREATED.orders.push(order3);

    r = await call("PUT", `/orders/${order3}/status`, { token: vendorToken, body: { status: "REJECTED" } });
    ok("🔒 reject bina reason → 422", r.status === 422, `${r.status} ${r.message}`);

    r = await call("PUT", `/orders/${order3}/status`, {
      token: vendorToken, body: { status: "REJECTED", reason: "stock khatam" },
    });
    ok("vendor reject (reason ke saath) → 200", r.status === 200, `${r.status} ${r.message}`);
    p = await Product.findById(prodId).select("stockQuantity").lean();
    ok("reject pe bhi stock wapas", p.stockQuantity === 3, `mila ${p.stockQuantity}`);

    // ══════════════════════════════════════════════════════════
    hr("11. Stock guard — stock se zyada order");
    await Product.updateOne({ _id: prodId }, { $set: { stockQuantity: 1 } });
    r = await call("POST", "/carts/add-or-update", { token: custToken, body: { productId: prodId, quantity: 5 } });
    if (r.data?._id) CREATED.carts.push(r.data._id);
    ok("quantity stock tak clamp hui", r.data?.items?.[0]?.quantity === 1, `mila ${r.data?.items?.[0]?.quantity}`);

    await Product.updateOne({ _id: prodId }, { $set: { stockQuantity: 0, isOutOfStock: true } });
    r = await call("POST", "/carts/verify-delivery", { token: custToken, body: { locationId: addrId } });
    ok("out-of-stock pe verify → 400 FAILED", r.status === 400, `${r.status} ${r.message}`);
    ok("...unavailableItems aaye", !!r.error?.unavailableItems?.length, JSON.stringify(r.error));

    // ══════════════════════════════════════════════════════════
    hr("12. Vendor suspend → catalog gayab");
    await Product.updateOne({ _id: prodId }, { $set: { stockQuantity: 5, isOutOfStock: false } });
    r = await call("PUT", `/vendors/status/${vendorId}`, {
      token: adminToken, body: { status: "SUSPENDED" },
    });
    ok("vendor suspend → 200", r.status === 200, `${r.status} ${r.message}`);

    r = await call("GET", "/categories/getAll", { token: custToken });
    ok("🔑 suspend ke baad customer ko 404 (cache invalidate hua)", r.status === 404, `${r.status} ${r.message}`);
    ok("...code PINCODE_NOT_SERVICEABLE", r.code === "PINCODE_NOT_SERVICEABLE");

    r = await call("PUT", `/vendors/status/${vendorId}`, {
      token: adminToken, body: { status: "APPROVED" },
    });
    r = await call("GET", "/categories/getAll", { token: custToken });
    ok("wapas approve → catalog dikha", r.status === 200, `${r.status} ${r.message}`);

    // ══════════════════════════════════════════════════════════
    hr("13. Delivery settings — vendor apni khud manage karta hai");
    r = await call("POST", "/carts/add-or-update", { token: custToken, body: { productId: prodId, quantity: 1 } });
    if (r.data?._id) CREATED.carts.push(r.data._id);

    // 🔒 vendor sirf delivery edit kar sakta hai, baaki kuch nahi
    r = await call("PUT", `/vendors/update/${vendorId}`, {
      token: vendorToken, body: { shopName: "hacked name" },
    });
    ok("🔒 vendor shopName nahi badal sakta → 403", r.status === 403, `${r.status} ${r.message}`);
    r = await call("PUT", `/vendors/update/${vendorId}`, {
      token: vendorToken, body: { commissionPercent: 0 },
    });
    ok("🔒 vendor commission nahi badal sakta → 403", r.status === 403, `${r.status} ${r.message}`);
    r = await call("PUT", `/vendors/update/${vendorId}`, {
      token: vendorToken, body: { status: "APPROVED" },
    });
    ok("🔒 vendor status nahi badal sakta → 403", r.status === 403, `${r.status} ${r.message}`);

    // 🔑 Vendor ne kuch set hi nahi kiya — defaults bhare hue hain par OFF
    r = await call("POST", "/orders/preview", { token: custToken, body: { locationId: addrId } });
    ok("🔑 default values bhari hain PAR isEnabled false → charge ₹0",
      r.data?.deliveryCharge === 0, `mila ${r.data?.deliveryCharge}`);

    // vendor rates tweak karta hai — phir bhi OFF hai
    r = await call("PUT", "/vendors/me/delivery", {
      token: vendorToken,
      body: { baseCharge: 30, perKmRate: 5, perKgRate: 1.5, minDeliveryCharge: 40 },
    });
    ok("🏪 vendor apni delivery set kar sakta hai → 200", r.status === 200, `${r.status} ${r.message}`);
    ok("isEnabled abhi bhi false", r.data?.delivery?.isEnabled === false);

    r = await call("POST", "/orders/preview", { token: custToken, body: { locationId: addrId } });
    ok("🔑 rates set karne se bhi charge ON nahi hua (₹0)",
      r.data?.deliveryCharge === 0, `mila ${r.data?.deliveryCharge}`);

    r = await call("PUT", "/vendors/me/delivery", {
      token: vendorToken, body: { isEnabled: true },
    });
    ok("vendor ne charge ON kiya → 200", r.status === 200, `${r.status} ${r.message}`);

    r = await call("POST", "/orders/preview", { token: custToken, body: { locationId: addrId } });
    ok("🔑 ab deliveryCharge > 0", r.data?.deliveryCharge > 0, `mila ${r.data?.deliveryCharge}`);
    ok("payableAmount = subTotal + charge",
      r.data?.payableAmount === r.data?.subTotal + r.data?.deliveryCharge);

    // platform hard cap
    r = await call("PUT", "/vendors/me/delivery", {
      token: vendorToken, body: { baseCharge: 99999 },
    });
    r = await call("POST", "/orders/preview", { token: custToken, body: { locationId: addrId } });
    ok("🔒 platform hard cap ₹200 lagta hai (vendor 99999 nahi laga sakta)",
      r.data?.deliveryCharge === 200, `mila ${r.data?.deliveryCharge}`);

    // free delivery
    r = await call("PUT", "/vendors/me/delivery", {
      token: vendorToken, body: { baseCharge: 30, freeDeliveryAbove: 500 },
    });
    r = await call("POST", "/orders/preview", { token: custToken, body: { locationId: addrId } });
    ok("freeDeliveryAbove lag gaya → charge 0", r.data?.deliveryCharge === 0, `mila ${r.data?.deliveryCharge}`);
    ok("freeDeliveryApplied true", r.data?.freeDeliveryApplied === true);

    // vendor radius global cap se upar nahi ja sakta
    r = await call("PUT", "/vendors/me/delivery", {
      token: vendorToken, body: { isEnabled: false, maxRadiusKm: 0.1, freeDeliveryAbove: null },
    });
    ok("vendor ne apna radius 0.1km kiya", r.status === 200, `${r.status} ${r.message}`);
    r = await call("POST", "/orders/preview", { token: custToken, body: { locationId: addrId } });
    ok("🔑 vendor ke chhote radius se bahar → 400 OUT_OF_RADIUS", r.status === 400, `${r.status} ${r.message}`);
    ok("...code OUT_OF_RADIUS", r.code === "OUT_OF_RADIUS", r.code);
    await call("PUT", "/vendors/me/delivery", { token: vendorToken, body: { maxRadiusKm: null } });

    // 🔒 dusre vendor ki delivery nahi badal sakta (apni hi badalta hai)
    r = await call("PUT", "/vendors/me/delivery", { token: rivalToken, body: { baseCharge: 7 } });
    ok("rival apni hi delivery badalta hai", r.status === 200 && String(r.data?.vendorId) === String(rivalId));

    // 🔒 settings ab admin-only
    r = await call("GET", "/settings/get", { token: custToken });
    ok("🔒 customer ko /settings/get → 403", r.status === 403, `${r.status} ${r.message}`);

    // ══════════════════════════════════════════════════════════
    hr("14. Address delete → default promote");
    r = await call("DELETE", `/locations/delete/${addrId}`, { token: custToken });
    ok("default address delete → 200", r.status === 200, `${r.status} ${r.message}`);
    const remaining = await mongoose.connection.collection("locations").findOne({
      userId: new mongoose.Types.ObjectId(custId), isDeleted: false, isDefault: true,
    });
    ok("🔑 dusra address apne aap default bana", !!remaining, "koi default nahi bacha");
    const u2 = await User.findById(custId).select("locationId").lean();
    ok("user.locationId bhi update hua", String(u2?.locationId) === String(remaining?._id));
  } finally {
    server.close();

    if (KEEP) {
      console.log(`\n⚠️  --keep diya gaya — test data DB me chhod diya (tag ${TAG})`);
    } else {
      hr("CLEANUP");
      const db = mongoose.connection.db;
      const toId = (x) => new mongoose.Types.ObjectId(String(x));
      const plan = [
        ["users", CREATED.users],
        ["locations", CREATED.locations],
        ["categories", CREATED.categories],
        ["subcategories", CREATED.subcategories],
        ["products", CREATED.products],
        ["orders", CREATED.orders],
        ["carts", CREATED.carts],
        ["vendorprofiles", CREATED.vendorprofiles],
        ["vendorserviceareas", CREATED.vendorserviceareas],
      ];
      for (const [coll, ids] of plan) {
        if (!ids.length) continue;
        const res = await db
          .collection(coll)
          .deleteMany({ _id: { $in: ids.map(toId) } });
        console.log(`   ${coll.padEnd(22)} ${res.deletedCount} deleted`);
      }
      // customer ke carts jo test ne banaye
      const c = await db.collection("carts").deleteMany({
        userId: { $in: CREATED.users.map(toId) },
      });
      console.log(`   ${"carts (by user)".padEnd(22)} ${c.deletedCount} deleted`);
      console.log("   ✅ test data saaf ho gaya");
    }
    await mongoose.disconnect();
  }

  console.log(`\n${"═".repeat(74)}`);
  console.log(`  PASS: ${pass}    FAIL: ${fail}`);
  if (failures.length) {
    console.log(`${"═".repeat(74)}`);
    failures.forEach((f) => console.log(`  ❌ ${f}`));
  }
  console.log("═".repeat(74));
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("\n💥 E2E CRASH:", e.message);
  console.error(e.stack);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
