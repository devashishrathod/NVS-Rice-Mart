/* eslint-disable no-console */
/**
 * LEGACY ARTIFACT CLEANUP — purane code ne jo nishaan chhode hain unhe hatata
 * hai aur adhoore documents ko naye shape me le aata hai.
 *
 *   node scripts/cleanupLegacyArtifacts.js            # DRY RUN (kuch likhta nahi)
 *   node scripts/cleanupLegacyArtifacts.js --apply    # actual writes
 *
 * Kya-kya karta hai:
 *   1. `productlocations` collection drop  (model delete ho chuka hai)
 *   2. `location_2dsphere` index drop      (schema me `location` field hai hi nahi)
 *   3. `isProductAddress` / `isVendorAddress` fields unset
 *   4. Jin locations pe `type` nahi hai unhe sahi `type` de do
 *        - userId ka role `vendor` ho  → VENDOR_BRANCH
 *        - warna                       → CUSTOMER
 *   5. Jis customer ke paas address hain par koi `isDefault` nahi, uske sabse
 *      purane address ko default bana do (naya code pehla address apne aap
 *      default banata hai — purana code nahi banata tha)
 *
 * ⚠️ Chalane se PEHLE purana build band kar do. Wo connected raha to mongoose
 *    ka `autoIndex` `productlocations` aur `location_2dsphere` dobara bana
 *    dega, aur naye adhoore documents banate rahega.
 *
 * Idempotent hai — dobara chalane pe "0 badla" bolega.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const { ROLES, LOCATION_TYPES } = require("../constants");

const APPLY = process.argv.includes("--apply");

const log = (s = "") => console.log(s);
const hr = (t) => log(`\n${"─".repeat(76)}\n  ${t}\n${"─".repeat(76)}`);

let changes = 0;
const plan = [];
const note = (what, n) => {
  plan.push([what, n]);
  changes += n;
  log(`  ${n ? "•" : "·"} ${String(n).padStart(5)}  ${what}`);
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const dbName = mongoose.connection.name;
  const db = mongoose.connection.db;

  log(`\n${APPLY ? "🔴 APPLY MODE" : "🔍 DRY RUN"}   DB: ${dbName}\n`);
  if (/prod/i.test(dbName)) {
    log("  ⚠️  Ye PRODUCTION DB hai — dhyan se.\n");
  }

  // ── 1. productlocations collection ──────────────────────────
  hr("1. `productlocations` collection");
  const colls = (await db.listCollections().toArray()).map((c) => c.name);
  if (!colls.includes("productlocations")) {
    note("productlocations pehle se nahi hai", 0);
  } else {
    const n = await db.collection("productlocations").countDocuments();
    if (n > 0) {
      log(`  ❌ ${n} documents hain — drop NAHI kar raha.`);
      log("     Pehle inka backup/audit karo, phir manually drop karna:");
      log('       db.productlocations.drop()');
      note("productlocations me data hai, skip kiya", 0);
    } else {
      note("productlocations drop karni hai (khaali hai)", 1);
      if (APPLY) await db.collection("productlocations").drop();
    }
  }

  // ── 2. location_2dsphere index ──────────────────────────────
  hr("2. `location_2dsphere` index");
  const idx = await db.collection("locations").indexes();
  const stale = idx.find((i) => i.name === "location_2dsphere");
  if (!stale) {
    note("location_2dsphere pehle se nahi hai", 0);
  } else {
    note("location_2dsphere drop karna hai", 1);
    if (APPLY) await db.collection("locations").dropIndex("location_2dsphere");
  }

  // ── 3. dead fields ──────────────────────────────────────────
  hr("3. Hataye ja chuke fields");
  for (const field of ["isProductAddress", "isVendorAddress"]) {
    const n = await db
      .collection("locations")
      .countDocuments({ [field]: { $exists: true } });
    note(`locations.${field} unset karna hai`, n);
    if (APPLY && n) {
      // `strict: false` zaroori hai — field schema me hai hi nahi, warna
      // mongoose update object se hi nikal deta hai
      await db
        .collection("locations")
        .updateMany({ [field]: { $exists: true } }, { $unset: { [field]: "" } });
    }
  }

  // ── 4. bina `type` wale locations ───────────────────────────
  hr("4. Locations jinpe `type` nahi hai");
  const typeless = await db
    .collection("locations")
    .find({ $or: [{ type: null }, { type: { $exists: false } }] })
    .toArray();

  if (!typeless.length) {
    note("sab locations pe type set hai", 0);
  } else {
    const vendorIds = new Set(
      (
        await db
          .collection("users")
          .find({ _id: { $in: typeless.map((l) => l.userId).filter(Boolean) }, role: ROLES.VENDOR })
          .project({ _id: 1 })
          .toArray()
      ).map((u) => String(u._id)),
    );

    const toCustomer = typeless.filter((l) => !vendorIds.has(String(l.userId)));
    const toBranch = typeless.filter((l) => vendorIds.has(String(l.userId)));

    typeless.forEach((l) => {
      const t = vendorIds.has(String(l.userId))
        ? LOCATION_TYPES.VENDOR_BRANCH
        : LOCATION_TYPES.CUSTOMER;
      log(
        `       ${String(l._id)}  ${String(l.zipcode || "-").padEnd(7)} ${String(
          l.name || "(bina naam)",
        ).slice(0, 20).padEnd(22)} → ${t}`,
      );
    });

    note(`type = CUSTOMER set karna hai`, toCustomer.length);
    note(`type = VENDOR_BRANCH set karna hai`, toBranch.length);

    if (APPLY) {
      if (toCustomer.length) {
        await db
          .collection("locations")
          .updateMany(
            { _id: { $in: toCustomer.map((l) => l._id) } },
            { $set: { type: LOCATION_TYPES.CUSTOMER } },
          );
      }
      if (toBranch.length) {
        await db
          .collection("locations")
          .updateMany(
            { _id: { $in: toBranch.map((l) => l._id) } },
            { $set: { type: LOCATION_TYPES.VENDOR_BRANCH } },
          );
      }
    }
  }

  // ── 5. bina default wale customers ──────────────────────────
  hr("5. Customers jinke paas address hai par koi default nahi");
  const orphans = await db
    .collection("locations")
    .aggregate([
      { $match: { isDeleted: false, type: { $ne: LOCATION_TYPES.VENDOR_BRANCH } } },
      {
        $group: {
          _id: "$userId",
          anyDefault: { $max: { $cond: ["$isDefault", 1, 0] } },
          oldest: { $first: "$_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { anyDefault: 0 } },
    ])
    .toArray();

  note("customers jinka default promote karna hai", orphans.length);
  orphans.slice(0, 10).forEach((o) =>
    log(`       user ${String(o._id)}  (${o.count} address) → ${String(o.oldest)} default`),
  );
  if (orphans.length > 10) log(`       … aur ${orphans.length - 10}`);

  if (APPLY && orphans.length) {
    for (const o of orphans) {
      // sabse purana address (ObjectId ka order hi creation order hai)
      const first = await db
        .collection("locations")
        .find({ userId: o._id, isDeleted: false, type: { $ne: LOCATION_TYPES.VENDOR_BRANCH } })
        .sort({ _id: 1 })
        .limit(1)
        .toArray();
      if (first[0]) {
        await db
          .collection("locations")
          .updateOne({ _id: first[0]._id }, { $set: { isDefault: true } });
      }
    }
  }

  // ── Summary ─────────────────────────────────────────────────
  hr(APPLY ? "✅ HO GAYA" : "🔍 DRY RUN — ye hota");
  plan.forEach(([what, n]) => log(`  ${String(n).padStart(5)}  ${what}`));
  log(`\n  total ${changes} changes`);
  if (!APPLY) log("\n  Apply karne ke liye: node scripts/cleanupLegacyArtifacts.js --apply\n");
  else log("");

  await mongoose.disconnect();
};

run().catch(async (e) => {
  console.error("\n💥", e.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
