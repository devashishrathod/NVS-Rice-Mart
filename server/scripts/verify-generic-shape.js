/* eslint-disable no-console */
/**
 * GENERIC SHAPE CHECK — purana (migrated) doc aur naya (naye code se bana)
 * doc ka field-by-field diff.
 *
 *   MONGO_URL="<migrated db>" node scripts/verify-generic-shape.js
 *
 * Migration ke baad chalao. Ye sabit karta hai ki dono flows ka structure
 * bilkul ek hai — koi extra field, koi missing field nahi.
 */
require("dotenv").config();
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
const hr = (t) => console.log(`\n${"─".repeat(74)}\n  ${t}\n${"─".repeat(74)}`);

/** Doc ke top-level fields (createdAt/updatedAt/_id chhod ke) */
const shapeOf = (doc, ignore = []) =>
  Object.keys(doc || {})
    .filter((k) => !["_id", "__v", "createdAt", "updatedAt"].includes(k))
    .filter((k) => !ignore.includes(k))
    .sort();

const diff = (a, b) => ({
  onlyOld: a.filter((x) => !b.includes(x)),
  onlyNew: b.filter((x) => !a.includes(x)),
});

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;
  console.log(`\n🧬 GENERIC SHAPE CHECK   DB: ${mongoose.connection.name}\n`);

  // ── ORDERS ─────────────────────────────────────────────────
  hr("ORDERS — migrated (purana) vs naya");
  const migrated = await db
    .collection("orders")
    .findOne({ "statusHistory.note": "migrated" });
  const fresh = await db
    .collection("orders")
    .findOne({ "statusHistory.note": { $ne: "migrated" }, orderNumber: { $ne: null } });

  if (!migrated) ok("migrated order mila", false, "migration chalayi hai?");
  else if (!fresh) {
    ok(
      "naya order mila",
      false,
      "pehle postMigrationSmoke ya e2e chalao jo ek naya order banaye",
    );
  } else {
    const o = shapeOf(migrated);
    const n = shapeOf(fresh);
    const d = diff(o, n);
    console.log(`   purana : ${o.join(", ")}`);
    console.log(`   naya   : ${n.join(", ")}`);
    ok(
      "order ke TOP-LEVEL fields bilkul same",
      d.onlyOld.length === 0 && d.onlyNew.length === 0,
      `sirf-purane: [${d.onlyOld}]  sirf-naye: [${d.onlyNew}]`,
    );

    const oi = shapeOf(migrated.items?.[0]);
    const ni = shapeOf(fresh.items?.[0]);
    const di = diff(oi, ni);
    console.log(`   item purana : ${oi.join(", ")}`);
    console.log(`   item naya   : ${ni.join(", ")}`);
    ok(
      "items[] ke fields bilkul same",
      di.onlyOld.length === 0 && di.onlyNew.length === 0,
      `sirf-purane: [${di.onlyOld}]  sirf-naye: [${di.onlyNew}]`,
    );
    ok(
      "item = productId + quantity + price + productSnapshot",
      JSON.stringify(ni) ===
        JSON.stringify(["price", "productId", "productSnapshot", "quantity"]),
      ni.join(","),
    );
    ok("purane order me productSnapshot.name bhara hai", !!migrated.items?.[0]?.productSnapshot?.name);
    ok("purane order me vendorId hai", !!migrated.vendorId);
    ok("purane order me orderNumber hai", !!migrated.orderNumber);
    ok("purane order ka items[].vendorId gaya", migrated.items?.[0]?.vendorId === undefined);
    ok("purane order ka items[].locationId gaya", migrated.items?.[0]?.locationId === undefined);
  }

  // ── LOCATIONS ──────────────────────────────────────────────
  hr("LOCATIONS — purana (migrated) vs naya");
  const oldLoc = await db
    .collection("locations")
    .findOne({ type: "CUSTOMER", createdAt: { $lt: new Date("2026-09-13") } });
  const newLoc = await db
    .collection("locations")
    .findOne({ type: "CUSTOMER", createdAt: { $gte: new Date("2026-09-13") } });

  if (!oldLoc) ok("purana location mila", false);
  else {
    ok("purane location me type set hai", oldLoc.type === "CUSTOMER");
    ok("🗑️ isProductAddress gaya", oldLoc.isProductAddress === undefined);
    ok("🗑️ isVendorAddress gaya", oldLoc.isVendorAddress === undefined);
    ok("🗑️ geo gaya", oldLoc.geo === undefined);
    if (newLoc) {
      const d = diff(shapeOf(oldLoc), shapeOf(newLoc));
      ok(
        "location ke fields same",
        d.onlyOld.length === 0 && d.onlyNew.length === 0,
        `sirf-purane: [${d.onlyOld}]  sirf-naye: [${d.onlyNew}]`,
      );
    } else {
      console.log("   (naya location nahi mila — e2e chalao to compare hoga)");
    }
  }

  // ── CARTS ──────────────────────────────────────────────────
  hr("CARTS — cleared (migrated) vs naya");
  const clearedCart = await db
    .collection("carts")
    .findOne({ isPurchased: false, isDeleted: true, items: { $size: 0 } });
  const liveCart = await db
    .collection("carts")
    .findOne({ isPurchased: false, isDeleted: false, "items.0": { $exists: true } });

  if (!clearedCart) ok("cleared cart mila", false);
  else {
    ok("cleared cart: items khali", clearedCart.items?.length === 0);
    ok("cleared cart: verifiedAt null", clearedCart.verifiedAt === null);
    ok("cleared cart: vendorId absent (live code bhi yahi karta hai)", clearedCart.vendorId === undefined);
    ok("cleared cart: deliveryZipcode absent", clearedCart.deliveryZipcode === undefined);
    ok("cleared cart: totals 0",
      clearedCart.subTotal === 0 && clearedCart.totalWeight === 0 && clearedCart.totalQuantity === 0);
  }
  if (liveCart) {
    ok("live cart me vendorId HAI", !!liveCart.vendorId);
    ok("live cart ke item me vendorId NAHI", liveCart.items?.[0]?.vendorId === undefined);
  } else {
    console.log("   (live cart nahi mila — normal hai, migration ne sab clear kiye)");
  }

  // ── CATALOG ────────────────────────────────────────────────
  hr("CATALOG — userId har jagah");
  for (const c of ["categories", "subcategories", "products"]) {
    const missing = await db.collection(c).countDocuments({ userId: null });
    ok(`${c}: userId missing = 0`, missing === 0, `mila ${missing}`);
  }

  // ── SETTINGS ───────────────────────────────────────────────
  hr("SETTINGS — sirf platform hard caps");
  const s = await db.collection("settings").findOne({});
  const sd = Object.keys(s?.delivery || {}).sort();
  console.log(`   delivery: ${sd.join(", ")}`);
  ok(
    "sirf maxRadiusKm + maxAllowedDeliveryCharge",
    JSON.stringify(sd) === JSON.stringify(["maxAllowedDeliveryCharge", "maxRadiusKm"]),
    sd.join(","),
  );

  // ── VENDOR ─────────────────────────────────────────────────
  hr("VENDOR PROFILE");
  const vp = await db.collection("vendorprofiles").findOne({});
  ok("vendorprofile mila", !!vp);
  if (vp) {
    ok("delivery.isEnabled false", vp.delivery?.isEnabled === false);
    ok("delivery values bhari (baseCharge 30)", vp.delivery?.baseCharge === 30);
    ok("defaultLocationId set", !!vp.defaultLocationId);
  }

  // ── DROPPED ────────────────────────────────────────────────
  hr("DROPPED collections");
  const cols = (await db.listCollections().toArray()).map((c) => c.name);
  ok("🗑️ productlocations drop ho gayi", !cols.includes("productlocations"));
  console.log(`   bachi hui: ${cols.sort().join(", ")}`);

  // ── INDEXES ────────────────────────────────────────────────
  hr("INDEXES");
  const li = (await db.collection("locations").indexes()).map((i) => i.name);
  ok("🗑️ location_2dsphere gaya", !li.includes("location_2dsphere"));
  ok("🗑️ geo_2dsphere gaya", !li.includes("geo_2dsphere"));
  const oi2 = await db.collection("orders").indexes();
  ok("orders.orderNumber UNIQUE", oi2.some((i) => i.name === "orderNumber_1" && i.unique));
  const vsa = await db.collection("vendorserviceareas").indexes();
  ok("vendorserviceareas.zipcode UNIQUE (D1)",
    vsa.some((i) => i.name === "zipcode_1" && i.unique));

  await mongoose.disconnect();
  console.log(`\n${"═".repeat(74)}`);
  console.log(`  PASS: ${pass}    FAIL: ${fail}`);
  console.log("═".repeat(74));
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("\n💥", e.message, e.stack);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
