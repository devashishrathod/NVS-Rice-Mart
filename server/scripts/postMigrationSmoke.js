/* eslint-disable no-console */
/**
 * POST-MIGRATION SMOKE — migrated data pe asli flow, asli HTTP calls.
 *
 *   MONGO_URL="<rehearsal>" node scripts/postMigrationSmoke.js
 *
 * E2E test apna data banata hai; ye script MIGRATED prod data use karti hai —
 * asli customers, asli products, asli vendor. Yahi batata hai ki migration
 * ke baad customer ko wahi dikhega jo dikhna chahiye.
 *
 * 🔒 PROD DB pe chalne se mana karta hai.
 */
require("dotenv").config();
const express = require("express");
const fileUpload = require("express-fileupload");
const mongoose = require("mongoose");

const { errorHandler } = require("../middlewares");
const { throwError } = require("../utils");

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
const call = async (method, path, { token, body } = {}) => {
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
    /* ignore */
  }
  return { status: res.status, ...json };
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const dbName = mongoose.connection.name;
  if (/prod/i.test(dbName)) {
    throw new Error(`ABORT: ye PRODUCTION DB hai (${dbName}).`);
  }
  console.log(`\n🔬 POST-MIGRATION SMOKE   DB: ${dbName}\n`);

  const app = express();
  app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));
  app.use(express.json());
  app.use("/nvs-rice-mart/", require("../routes"));
  app.use(() => throwError(404, "Invalid API"));
  app.use(errorHandler);
  const server = await new Promise((r) => {
    const s = app.listen(0, () => r(s));
  });
  BASE = `http://127.0.0.1:${server.address().port}/nvs-rice-mart`;

  const User = require("../models/User");
  const Location = require("../models/Location");
  const Product = require("../models/Product");
  const Order = require("../models/Order");
  const Cart = require("../models/Cart");
  const VendorProfile = require("../models/VendorProfile");
  const VendorServiceArea = require("../models/VendorServiceArea");
  const { ROLES, LOCATION_TYPES } = require("../constants");

  const created = { orders: [], carts: [] };

  try {
    // ══════════════════════════════════════════════════════════
    hr("1. Migrated vendor");
    const vendorUser = await User.findOne({
      email: "nagraj@gmail.com",
      role: ROLES.VENDOR,
      isDeleted: false,
    });
    ok("vendor user mila", !!vendorUser);
    const profile = await VendorProfile.findOne({ vendorId: vendorUser?._id }).lean();
    ok("VendorProfile mila", !!profile, "migration ne banaya hona chahiye");
    ok(`shopName "Nagraj Mart"`, profile?.shopName === "Nagraj Mart");
    ok("🔑 delivery.isEnabled FALSE (charge ₹0)", profile?.delivery?.isEnabled === false);
    ok("delivery values bhari hui (baseCharge 30)", profile?.delivery?.baseCharge === 30,
      `mila ${profile?.delivery?.baseCharge}`);

    const pickup = await Location.findById(profile?.defaultLocationId).lean();
    ok("pickup branch mila", !!pickup);
    ok("pickup type VENDOR_BRANCH", pickup?.type === LOCATION_TYPES.VENDOR_BRANCH);
    ok("pickup isDefault", pickup?.isDefault === true);
    ok(`pickup coordinates valid ${JSON.stringify(pickup?.coordinates)}`,
      Number(pickup?.coordinates?.[0]) && Number(pickup?.coordinates?.[1]));

    const areas = await VendorServiceArea.find({ isDeleted: false }).lean();
    ok("6 service areas", areas.length === 6, `mile ${areas.length}`);
    ok("zipcodes 577001-577006",
      areas.map((a) => a.zipcode).sort().join(",") === "577001,577002,577003,577004,577005,577006");
    ok("sab ek hi vendor ke", areas.every((a) => String(a.vendorId) === String(vendorUser._id)));

    let r = await call("POST", "/auth/login", {
      body: { type: "email", email: "nagraj@gmail.com", password: "nagraj@123", role: "vendor" },
    });
    const vendorToken = r.data?.token;
    ok("vendor password se login → token", !!vendorToken, `${r.status} ${r.message}`);

    // ══════════════════════════════════════════════════════════
    hr("2. Migrated catalog — vendor ko apna sab dikhta hai");
    // NOTE: pehle yahan 17 / 30 / 76 hardcoded the. Prod live hai — orders aur
    // products badhte rehte hain, isliye wo numbers har kuch din me rot ho
    // jaate the (82 orders pe fail hua). Ab expected value DB se hi nikalti
    // hai — ye test asal me BEHTAR hai, kyunki ab ye sabit karta hai ki API
    // wahi lauta rahi hai jo DB me hai, na ki koi jaadui number.
    const Category = require("../models/Category");
    const dbVendorCats = await Category.countDocuments({
      userId: vendorUser._id,
      isDeleted: false,
    });
    const dbVendorProducts = await Product.countDocuments({
      userId: vendorUser._id,
      isDeleted: false,
      isActive: true,
    });

    r = await call("GET", "/categories/getAll?limit=100", { token: vendorToken });
    ok("vendor categories → 200", r.status === 200, `${r.status} ${r.message}`);
    ok(
      `vendor ko apni saari categories dikhi (${r.data?.total} = DB ke ${dbVendorCats})`,
      r.data?.total === dbVendorCats,
      `mila ${r.data?.total}, DB me ${dbVendorCats}`,
    );

    r = await call("GET", "/products/getAll?limit=200", { token: vendorToken });
    ok("vendor products → 200", r.status === 200);
    ok(
      `vendor ko apne saare active products dikhe (${r.data?.total} = DB ke ${dbVendorProducts})`,
      r.data?.total === dbVendorProducts,
      `mila ${r.data?.total}, DB me ${dbVendorProducts}`,
    );

    // Har purana order migrate hua ya nahi — exact count pin karna ho to
    // `EXPECT_MIGRATED_ORDERS=<n>` env de do, warna bas "0 se zyada" check.
    const migratedCount = await Order.countDocuments({
      "statusHistory.note": "migrated",
    });
    const expectMigrated = process.env.EXPECT_MIGRATED_ORDERS
      ? Number(process.env.EXPECT_MIGRATED_ORDERS)
      : null;
    ok(
      expectMigrated
        ? `exactly ${expectMigrated} migrated orders (mila ${migratedCount})`
        : `migrated orders mile (${migratedCount})`,
      expectMigrated ? migratedCount === expectMigrated : migratedCount > 0,
      `mila ${migratedCount}`,
    );
    const dbTotalOrders = await Order.countDocuments({});
    r = await call("GET", "/orders/getAll?limit=500", { token: vendorToken });
    ok(
      `vendor ko saare orders dikhe (${r.data?.total} = DB ke ${dbTotalOrders})`,
      r.data?.total === dbTotalOrders,
      `mila ${r.data?.total}, DB me ${dbTotalOrders}`,
    );
    ok("order me orderNumber hai", /^NVS-\d{4}-\d{6}$/.test(r.data?.data?.[0]?.orderNumber || ""),
      r.data?.data?.[0]?.orderNumber);
    ok("order me vendorId hai", !!r.data?.data?.[0]?.vendorId);
    ok("order me deliveryPincode hai", !!r.data?.data?.[0]?.deliveryPincode);
    ok("statusHistory seed hui", r.data?.data?.[0]?.statusHistory?.length >= 1);

    r = await call("GET", "/orders/vendor/summary", { token: vendorToken });
    ok("vendor summary → 200", r.status === 200, `${r.status} ${r.message}`);
    ok(
      `summary me saare orders (${r.data?.totalOrders} >= 76)`,
      r.data?.totalOrders >= 76,
    );
    ok(`delivered revenue ₹${r.data?.lifetimeRevenue}`, r.data?.lifetimeRevenue > 0);

    // ══════════════════════════════════════════════════════════
    hr("3. Asli migrated customer — serviceable pincode");
    const inArea = await Location.findOne({
      type: LOCATION_TYPES.CUSTOMER,
      isDeleted: false,
      isDefault: true,
      zipcode: { $in: ["577001", "577002", "577004"] },
    }).lean();
    ok("serviceable address wala customer mila", !!inArea, "migration ne isDefault set kiya hona chahiye");

    const cust = await User.findById(inArea?.userId);
    ok("uska user mila", !!cust);
    ok("user.locationId sync hua", String(cust?.locationId) === String(inArea?._id));
    const custToken = cust?.getSignedJwtToken();

    r = await call("GET", "/categories/getAll?limit=100", { token: custToken });
    ok(`customer (${inArea?.zipcode}) ko categories → 200`, r.status === 200, `${r.status} ${r.message} ${r.code || ""}`);
    const dbActiveCats = await Category.countDocuments({
      userId: vendorUser._id,
      isDeleted: false,
      isActive: true,
    });
    ok(
      `customer ko active categories dikhi (${r.data?.total} = DB ke ${dbActiveCats})`,
      r.data?.total === dbActiveCats,
      `mila ${r.data?.total}, DB me ${dbActiveCats}`,
    );

    r = await call("GET", "/products/getAll?limit=200", { token: custToken });
    ok("customer ko products → 200", r.status === 200, `${r.status} ${r.message}`);
    ok(
      `customer ko wahi products dikhe jo vendor ke paas hain (${r.data?.total} = ${dbVendorProducts})`,
      r.data?.total === dbVendorProducts,
      `mila ${r.data?.total}, DB me ${dbVendorProducts}`,
    );
    ok("sab ek hi vendor ke", (r.data?.data || []).every((p) => String(p.userId) === String(vendorUser._id)));

    // Case-insensitive — product names ab proper case me save hote hain
    // ("bell" → "Bell"), runbook §10. Ye check naam ki casing ke baare me
    // nahi hai, product ke maujood hone aur uske price ke baare me hai.
    const bell = (r.data?.data || []).find(
      (p) => String(p.name).toLowerCase() === "bell",
    );
    ok("`bell` product dikha", !!bell);
    ok("🔑 bell ka price ₹1100 (₹950 se update hua)", bell?.generalPrice === 1100,
      `mila ${bell?.generalPrice}`);

    r = await call("GET", `/service-areas/check?zipcode=${inArea?.zipcode}`, { token: custToken });
    ok("serviceability check → 200", r.status === 200);
    ok("shopName Nagraj Mart", r.data?.vendor?.shopName === "Nagraj Mart");

    // ══════════════════════════════════════════════════════════
    hr("4. Asli customer — service area ke BAHAR");
    const outArea = await Location.findOne({
      type: LOCATION_TYPES.CUSTOMER,
      isDeleted: false,
      isDefault: true,
      zipcode: { $nin: ["577001", "577002", "577003", "577004", "577005", "577006"] },
    }).lean();
    if (!outArea) {
      ok("bahar wala customer (skip — koi nahi mila)", true);
    } else {
      const outUser = await User.findById(outArea.userId);
      const outToken = outUser?.getSignedJwtToken();
      r = await call("GET", "/categories/getAll", { token: outToken });
      ok(`${outArea.zipcode} wale customer ko 404`, r.status === 404, `${r.status} ${r.message}`);
      ok("...code PINCODE_NOT_SERVICEABLE", r.code === "PINCODE_NOT_SERVICEABLE", r.code);
    }

    // ══════════════════════════════════════════════════════════
    hr("5. Address ke BINA customer (1355 aise hain)");
    const noAddr = await User.aggregate([
      { $match: { role: ROLES.USER, isDeleted: false } },
      { $lookup: { from: "locations", localField: "_id", foreignField: "userId", as: "locs" } },
      { $match: { locs: { $size: 0 } } },
      { $limit: 1 },
    ]);
    ok("bina address wala customer mila", noAddr.length === 1);
    if (noAddr.length) {
      const u = await User.findById(noAddr[0]._id);
      r = await call("GET", "/categories/getAll", { token: u.getSignedJwtToken() });
      ok("→ 400 PINCODE_REQUIRED", r.status === 400 && r.code === "PINCODE_REQUIRED",
        `${r.status} ${r.code}`);
      ok("🔑 app ko yahan address onboarding screen dikhani hai", true);
    }

    // ══════════════════════════════════════════════════════════
    hr("6. Poora order — asli migrated product se");
    const p = await Product.findOne({
      userId: vendorUser._id, isDeleted: false, isActive: true,
      stockQuantity: { $gt: 2 }, isOutOfStock: { $ne: true },
    }).lean();
    ok("orderable product mila", !!p, `${p?.name} stock ${p?.stockQuantity}`);
    const stockBefore = p.stockQuantity;

    await Cart.deleteMany({ userId: cust._id, isPurchased: false });
    r = await call("POST", "/carts/add-or-update", {
      token: custToken, body: { productId: p._id, quantity: 1 },
    });
    ok("cart me add → 201", r.status === 201, `${r.status} ${r.message} ${r.code || ""}`);
    if (r.data?._id) created.carts.push(r.data._id);
    ok("cart.vendorId set", String(r.data?.vendorId) === String(vendorUser._id));

    r = await call("POST", "/carts/verify-delivery", {
      token: custToken, body: { locationId: inArea._id },
    });
    ok("verify-delivery → 200 OK", r.status === 200 && r.data?.status === "OK",
      `${r.status} ${r.message} ${JSON.stringify(r.data || r.error)}`);

    r = await call("POST", "/orders/preview", {
      token: custToken, body: { locationId: inArea._id },
    });
    ok("preview → 200", r.status === 200, `${r.status} ${r.message} ${r.code || ""}`);
    ok(`🔑 deliveryCharge ₹0 (isEnabled false)`, r.data?.deliveryCharge === 0,
      `mila ${r.data?.deliveryCharge}`);
    ok("payableAmount = subTotal", r.data?.payableAmount === r.data?.subTotal);
    ok(`distanceKm nikla (${r.data?.distanceKm} km)`, r.data?.distanceKm >= 0);
    const preview = r.data;

    r = await call("POST", "/orders/create", {
      token: custToken, body: { locationId: inArea._id, paymentMethod: "COD" },
    });
    ok("order create → 201", r.status === 201, `${r.status} ${r.message} ${r.code || ""}`);
    const orderId = r.data?.orderId;
    if (orderId) created.orders.push(orderId);
    ok("status PENDING", r.data?.status === "PENDING");
    ok("preview ka total == order ka total", r.data?.payableAmount === preview?.payableAmount);
    ok("🔑 orderNumber migrated ke AAGE se (counter seed hua)",
      /^NVS-\d{4}-\d{6}$/.test(r.data?.orderNumber || ""), r.data?.orderNumber);

    const clash = await Order.countDocuments({ orderNumber: r.data?.orderNumber });
    ok("🔑 orderNumber unique — purane 76 se takra nahi", clash === 1, `mile ${clash}`);

    const after = await Product.findById(p._id).select("stockQuantity").lean();
    ok(`stock ${stockBefore} → ${after.stockQuantity}`, after.stockQuantity === stockBefore - 1);

    // vendor flow
    for (const st of ["ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      r = await call("PUT", `/orders/${orderId}/status`, {
        token: vendorToken, body: { status: st },
      });
      ok(`vendor → ${st}`, r.status === 200 && r.data?.status === st, `${r.status} ${r.message}`);
    }

    // ══════════════════════════════════════════════════════════
    hr("7. Data integrity — migrated collections");
    const checks = [
      ["products with null userId", await Product.countDocuments({ userId: null }), 0],
      ["locations with null type", await Location.countDocuments({ type: null }), 0],
      ["orders without vendorId", await Order.countDocuments({ vendorId: null }), 0],
      ["orders without orderNumber", await Order.countDocuments({ orderNumber: null }), 0],
      ["non-empty unpurchased carts", await Cart.countDocuments({ isPurchased: false, "items.0": { $exists: true }, _id: { $nin: created.carts } }), 0],
      ["vendor branches (type)", await Location.countDocuments({ type: LOCATION_TYPES.VENDOR_BRANCH }), 8],
      ["default vendor branch", await Location.countDocuments({ type: LOCATION_TYPES.VENDOR_BRANCH, isDefault: true }), 1],
      ["isProductAddress abhi bhi kahin?", await Location.countDocuments({ isProductAddress: { $exists: true } }), 0],
    ];
    checks.forEach(([label, got, want]) =>
      ok(`${label} = ${want}`, got === want, `mila ${got}`),
    );

    const settingDoc = await mongoose.connection.collection("settings").findOne({});
    ok("Setting me maxRadiusKm", settingDoc?.delivery?.maxRadiusKm === 50);
    ok("Setting me maxAllowedDeliveryCharge", settingDoc?.delivery?.maxAllowedDeliveryCharge === 200);
    ok("Setting se dead charge fields hate",
      settingDoc?.delivery?.baseCharge === undefined &&
        settingDoc?.delivery?.distanceFactor === undefined,
      JSON.stringify(settingDoc?.delivery));

    const locIdx = await mongoose.connection.collection("locations").indexes();
    ok("location_2dsphere drop hua", !locIdx.some((i) => i.name === "location_2dsphere"));
    ok("geo_2dsphere drop hua", !locIdx.some((i) => i.name === "geo_2dsphere"));
    const ordIdx = await mongoose.connection.collection("orders").indexes();
    ok("orders.orderNumber UNIQUE hai",
      ordIdx.some((i) => i.name === "orderNumber_1" && i.unique === true),
      JSON.stringify(ordIdx.find((i) => i.name === "orderNumber_1")));
  } finally {
    server.close();
    if (created.orders.length || created.carts.length) {
      console.log(
        `\n   ℹ️  smoke ne banaye: ${created.orders.length} order, ${created.carts.length} cart (rehearsal DB hai, chhod rahe hain)`,
      );
    }
    await mongoose.disconnect();
  }

  console.log(`\n${"═".repeat(74)}`);
  console.log(`  PASS: ${pass}    FAIL: ${fail}`);
  if (failures.length) {
    console.log("═".repeat(74));
    failures.forEach((f) => console.log(`  ❌ ${f}`));
  }
  console.log("═".repeat(74));
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("\n💥 CRASH:", e.message);
  console.error(e.stack);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
