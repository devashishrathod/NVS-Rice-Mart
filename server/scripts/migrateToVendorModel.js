/* eslint-disable no-console */
/**
 * Single-shop → vendor-based platform migration.
 *
 *   node scripts/migrateToVendorModel.js              # DRY RUN (default)
 *   node scripts/migrateToVendorModel.js --apply      # actually writes
 *   node scripts/migrateToVendorModel.js --apply --skip-indexes
 *
 * IDEMPOTENT — dobara chalane pe kuch nahi bigdega, har step pehle check
 * karta hai ki kaam already ho chuka hai ya nahi.
 *
 * ⚠️ Chalane se pehle `mongodump` le lena. Stage DB pe pehle test karna.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../models/User");
const Location = require("../models/Location");
const Category = require("../models/Category");
const SubCategory = require("../models/SubCategory");
const Product = require("../models/Product");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Setting = require("../models/Setting");
// NOTE: `ProductLocation` model JAAN-BOOJH KE require nahi kar rahe. Model
// register karte hi mongoose `autoIndex` collection wapas bana deta hai —
// aur hum use step 9 me drop kar rahe hain. Raw collection se padhenge.
const VendorProfile = require("../models/VendorProfile");
const VendorServiceArea = require("../models/VendorServiceArea");
const Counter = require("../models/Counter");

const {
  ROLES,
  LOGIN_TYPES,
  LOCATION_TYPES,
  VENDOR_STATUS,
  ORDER_STATUS,
  DEFAULT_VENDOR_DELIVERY,
} = require("../constants");

// ─────────────────────────────────────────────────────────────
const APPLY = process.argv.includes("--apply");
const SKIP_INDEXES = process.argv.includes("--skip-indexes");

const VENDOR = {
  shopName: "Nagraj Mart",
  name: "nagraj mart",
  email: "nagraj@gmail.com",
  mobile: "8210574144",
  password: "nagraj@123",
};

/** Blocker A — vendor ka mobile is test account ke paas hai (0 orders). */
const RELEASE_MOBILE_USER_ID = "6a1e620ec30c2b2ad899245b";
/** Blocker B — double-submit se bane duplicate users (dono khali). */
const DELETE_DUPLICATE_USER_IDS = [
  "6a943efba359116c474ca779",
  "6a943efba359116c474ca77a",
];
/** Q16 — 577006 ka galat coordinate. */
const GOOD_COORDS = [14.464, 75.92];
const BAD_COORD_LAT_TOLERANCE = 0.1;

// ─────────────────────────────────────────────────────────────
const log = (s = "") => console.log(s);
const step = (n, t) =>
  log(`\n${"═".repeat(76)}\n  STEP ${n} — ${t}\n${"═".repeat(76)}`);
const act = (what, count, detail = "") =>
  log(`   ${APPLY ? "WRITE " : "would "}${String(count).padStart(5)}  ${what}${detail ? "  " + detail : ""}`);
const skip = (what) => log(`   ✓ already done — ${what}`);
const warn = (what) => log(`   ⚠️  ${what}`);

const summary = [];
const record = (coll, op, count) => summary.push({ coll, op, count });

// ═════════════════════════════════════════════════════════════
const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const dbName = mongoose.connection.name;
  log(`\n${APPLY ? "🔴 APPLY MODE — DB me likha jayega" : "🔍 DRY RUN — kuch likha nahi jayega"}`);
  log(`   DB: ${dbName}\n`);

  if (APPLY && /prod/i.test(dbName)) {
    warn(`PRODUCTION DB detected (${dbName}) — mongodump liya hai na?`);
  }

  // ── STEP 1 — Blockers clear ────────────────────────────────
  step(1, "Blockers clear (unique index se pehle)");

  const releaseUser = await User.findOne({
    _id: RELEASE_MOBILE_USER_ID,
    isDeleted: false,
  }).lean();
  if (!releaseUser) {
    skip(`test account ${RELEASE_MOBILE_USER_ID} already released`);
  } else {
    const n = await Order.countDocuments({ userId: releaseUser._id });
    if (n > 0) {
      throw new Error(
        `ABORT: user ${RELEASE_MOBILE_USER_ID} ke ${n} orders hain — manually review karo`,
      );
    }
    act(`soft-delete test account (mobile ${releaseUser.mobile}, 0 orders)`, 1);
    record("users", "UPDATE", 1);
    if (APPLY) {
      await User.updateOne(
        { _id: releaseUser._id },
        {
          $set: { isDeleted: true, isActive: false },
          // mobile/email free karo taaki unique index clash na ho
          $unset: { mobile: "", email: "" },
        },
      );
    }
  }

  const dupUsers = await User.find({
    _id: { $in: DELETE_DUPLICATE_USER_IDS },
    isDeleted: false,
  }).lean();
  if (!dupUsers.length) {
    skip("duplicate-mobile users already removed");
  } else {
    for (const u of dupUsers) {
      const n = await Order.countDocuments({ userId: u._id });
      if (n > 0) {
        throw new Error(`ABORT: duplicate user ${u._id} ke ${n} orders hain`);
      }
    }
    act(`soft-delete duplicate users (mobile 8088684570)`, dupUsers.length);
    record("users", "UPDATE", dupUsers.length);
    if (APPLY) {
      await User.updateMany(
        { _id: { $in: dupUsers.map((u) => u._id) } },
        {
          $set: { isDeleted: true, isActive: false },
          $unset: { mobile: "", email: "" },
        },
      );
    }
  }

  // Koi aur duplicate to nahi bacha? (jinhe abhi delete kar rahe hain unhe chhod ke —
  // dry run me wo abhi DB me maujood hain)
  const plannedDeletes = [
    RELEASE_MOBILE_USER_ID,
    ...DELETE_DUPLICATE_USER_IDS,
  ].map((id) => new mongoose.Types.ObjectId(id));
  const remainingDupes = await User.aggregate([
    {
      $match: {
        _id: { $nin: plannedDeletes },
        mobile: { $exists: true, $ne: null },
        isDeleted: false,
      },
    },
    { $group: { _id: { m: "$mobile", r: "$role" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  if (remainingDupes.length) {
    warn(
      `${remainingDupes.length} aur duplicate {mobile, role} bache hain — unique index fail hoga:`,
    );
    remainingDupes.forEach((d) => log(`       ${d._id.m} (${d._id.r}) → ${d.n}`));
  } else {
    log("   ✅ koi duplicate {mobile, role} nahi bacha");
  }

  // ── STEP 2 — Vendor + profile + branch ─────────────────────
  step(2, "Vendor create (Nagraj Mart)");

  let vendor = await User.findOne({
    email: VENDOR.email,
    role: ROLES.VENDOR,
    isDeleted: false,
  });
  let vendorId = vendor?._id;

  if (vendor) {
    skip(`vendor ${VENDOR.email} already exists (${vendor._id})`);
  } else {
    act(`create User role=vendor "${VENDOR.name}" <${VENDOR.email}>`, 1);
    record("users", "INSERT", 1);
    if (APPLY) {
      vendor = new User({
        name: VENDOR.name,
        email: VENDOR.email,
        mobile: VENDOR.mobile,
        password: VENDOR.password, // pre-save hook bcrypt karega
        role: ROLES.VENDOR,
        loginType: LOGIN_TYPES.PASSWORD,
        isSignUpCompleted: true,
        isActive: true,
      });
      await vendor.save();
      vendorId = vendor._id;
      log(`       → vendorId = ${vendorId}`);
    } else {
      // Dry run: ek dummy ObjectId taaki aage ki queries cast na tooten.
      // Ye kisi doc se match nahi karegi — jo dry run me sahi hi hai.
      vendorId = new mongoose.Types.ObjectId();
      log(`       → vendorId = <naya banega>`);
    }
  }

  // Pickup branch — normally `Setting.delivery.shopLocationId` (prod me
  // yahi set hai). Stage/test DB me Setting na ho to sabse purani
  // product-address location fallback ban jati hai.
  const setting = await Setting.findOne().lean();
  let shopLocationId = setting?.delivery?.shopLocationId;
  let shopLoc = shopLocationId
    ? await Location.findById(shopLocationId).lean()
    : null;

  if (!shopLoc) {
    if (shopLocationId) {
      warn(`shopLocationId ${shopLocationId} ki Location nahi mili — fallback dhoondh rahe hain`);
    } else {
      warn("Setting.delivery.shopLocationId set nahi hai — fallback dhoondh rahe hain");
    }
    // Re-run pe `shopLocationId` aur `isProductAddress` dono unset ho chuke
    // hote hain — isliye pehle `type` se dhoondo.
    shopLoc = await Location.findOne({
      type: LOCATION_TYPES.VENDOR_BRANCH,
      isDefault: true,
      isDeleted: false,
    }).lean();
    if (!shopLoc) {
      shopLoc = await Location.findOne({
        isProductAddress: true,
        isDeleted: false,
      })
        .sort({ createdAt: 1 })
        .lean();
    }
    if (!shopLoc) {
      throw new Error(
        "ABORT: pickup branch nahi mila. Na Setting.delivery.shopLocationId hai, " +
          "na koi isProductAddress location. Pehle vendor ka branch banao.",
      );
    }
    shopLocationId = shopLoc._id;
    warn(`fallback pickup branch: ${shopLoc.zipcode} (${shopLocationId})`);
  }
  log(`   pickup branch → ${shopLoc.zipcode}  ${JSON.stringify(shopLoc.coordinates)}  (${shopLocationId})`);

  // 🔑 Global Setting ki delivery values vendor ke profile me MOVE ho rahi
  //    hain — par `isEnabled: false` ke saath. Matlab values ready milengi
  //    aur charge phir bhi ₹0 rahega (aaj jaisa hi). Vendor apne panel se
  //    jab chahe on kare.
  const d = setting?.delivery || {};
  const movedDelivery = {
    isEnabled: false, // ← charge OFF
    baseCharge: d.baseCharge ?? DEFAULT_VENDOR_DELIVERY.baseCharge,
    perKmRate: d.perKmRate ?? DEFAULT_VENDOR_DELIVERY.perKmRate,
    perKgRate: d.perKgRate ?? DEFAULT_VENDOR_DELIVERY.perKgRate,
    minDeliveryCharge:
      d.minDeliveryCharge ?? DEFAULT_VENDOR_DELIVERY.minDeliveryCharge,
    baseMaxCharge: d.baseMaxCharge ?? DEFAULT_VENDOR_DELIVERY.baseMaxCharge,
    maxPerKgIncrement:
      d.maxPerKgIncrement ?? DEFAULT_VENDOR_DELIVERY.maxPerKgIncrement,
    maxPerKmIncrement:
      d.maxPerKmIncrement ?? DEFAULT_VENDOR_DELIVERY.maxPerKmIncrement,
    freeDeliveryAbove: DEFAULT_VENDOR_DELIVERY.freeDeliveryAbove,
    minOrderAmount: DEFAULT_VENDOR_DELIVERY.minOrderAmount,
    maxRadiusKm: DEFAULT_VENDOR_DELIVERY.maxRadiusKm, // global hard cap lagega
  };

  let profile = vendorId && (await VendorProfile.findOne({ vendorId }).lean());
  if (profile) {
    skip("VendorProfile already exists");
  } else {
    act(`create VendorProfile "${VENDOR.shopName}"`, 1);
    log(
      `       delivery ← global Setting se copy, isEnabled=false (charge ₹0):`,
    );
    log(
      `       baseCharge ${movedDelivery.baseCharge} · perKm ${movedDelivery.perKmRate} · perKg ${movedDelivery.perKgRate} · minCharge ${movedDelivery.minDeliveryCharge}`,
    );
    record("vendorprofiles", "INSERT", 1);
    if (APPLY) {
      profile = await VendorProfile.create({
        vendorId,
        shopName: VENDOR.shopName,
        defaultLocationId: shopLocationId,
        delivery: movedDelivery,
        commissionPercent: 0,
        status: VENDOR_STATUS.APPROVED,
      });
    }
  }

  // ── STEP 3 — Locations backfill ────────────────────────────
  step(3, "Locations — type / userId / isDefault / coordinates");

  // Pehle run pe `isProductAddress` se milte hain. Dobara chalane pe wo flag
  // unset ho chuka hota hai, isliye tab `type` se dhoondte hain — warna
  // script inhe "customer address" samajh ke corrupt kar deti.
  let productAddrs = await Location.find({ isProductAddress: true }).lean();
  if (!productAddrs.length) {
    productAddrs = await Location.find({
      type: LOCATION_TYPES.VENDOR_BRANCH,
    }).lean();
    if (productAddrs.length) {
      skip(`vendor branches type-field se mile (${productAddrs.length}) — re-run`);
    }
  }
  const needBranch = productAddrs.filter(
    (l) => l.type !== LOCATION_TYPES.VENDOR_BRANCH,
  );
  if (!needBranch.length) skip("vendor branches already tagged");
  else {
    act(`Location → type=VENDOR_BRANCH, userId=<vendor>`, needBranch.length);
    record("locations", "UPDATE", needBranch.length);
    needBranch.forEach((l) =>
      log(`       ${l.zipcode}  ${l._id}${l.isDeleted ? "  [deleted]" : ""}`),
    );
    if (APPLY) {
      await Location.updateMany(
        { _id: { $in: needBranch.map((l) => l._id) } },
        { $set: { type: LOCATION_TYPES.VENDOR_BRANCH, userId: vendorId } },
      );
    }
  }

  // Q16 — galat coordinates fix
  const badCoords = productAddrs.filter(
    (l) =>
      Array.isArray(l.coordinates) &&
      Math.abs((l.coordinates[0] ?? 0) - GOOD_COORDS[0]) >
        BAD_COORD_LAT_TOLERANCE,
  );
  if (!badCoords.length) skip("branch coordinates already sane");
  else {
    act(`fix coordinates → ${JSON.stringify(GOOD_COORDS)}`, badCoords.length);
    record("locations", "UPDATE", badCoords.length);
    badCoords.forEach((l) =>
      log(`       ${l.zipcode}  ${JSON.stringify(l.coordinates)} → ${JSON.stringify(GOOD_COORDS)}`),
    );
    if (APPLY) {
      await Location.updateMany(
        { _id: { $in: badCoords.map((l) => l._id) } },
        { $set: { coordinates: GOOD_COORDS } },
      );
    }
  }

  // Pickup branch = isDefault (single-default invariant)
  const currentDefault = await Location.findOne({
    userId: vendorId,
    type: LOCATION_TYPES.VENDOR_BRANCH,
    isDefault: true,
    isDeleted: false,
  }).lean();
  if (currentDefault && String(currentDefault._id) === String(shopLocationId)) {
    skip("pickup branch already isDefault");
  } else {
    act(`set isDefault=true on pickup branch (${shopLoc.zipcode})`, 1);
    record("locations", "UPDATE", 1);
    if (APPLY) {
      await Location.updateMany(
        { userId: vendorId, type: LOCATION_TYPES.VENDOR_BRANCH },
        { $set: { isDefault: false } },
      );
      await Location.updateOne(
        { _id: shopLocationId },
        { $set: { isDefault: true, isActive: true } },
      );
      await User.updateOne(
        { _id: vendorId },
        { $set: { locationId: shopLocationId } },
      );
    }
  }

  // Customer locations → type=CUSTOMER
  // 🔴 Filter `type` pe hai, `isProductAddress` pe NAHI. Pehle `isProductAddress`
  //    pe tha — aur pehle run me wo flag unset ho jata hai, isliye dobara
  //    chalane pe ye 8 VENDOR_BRANCH ko bhi CUSTOMER bana deta tha. Uske
  //    baad har order 503 VENDOR_PICKUP_MISSING deta.
  const UNTYPED = {
    type: { $nin: [LOCATION_TYPES.CUSTOMER, LOCATION_TYPES.VENDOR_BRANCH] },
  };
  const custNoType = await Location.countDocuments(UNTYPED);
  if (!custNoType) skip("customer locations already typed");
  else {
    act("Location → type=CUSTOMER", custNoType);
    record("locations", "UPDATE", custNoType);
    if (APPLY) {
      await Location.updateMany(UNTYPED, {
        $set: { type: LOCATION_TYPES.CUSTOMER },
      });
    }
  }

  // Har customer ka LATEST active address → isDefault (+ user.locationId)
  const custDefaults = await Location.aggregate([
    {
      $match: {
        // type-based (isProductAddress pehle run me unset ho jata hai)
        type: { $ne: LOCATION_TYPES.VENDOR_BRANCH },
        isDeleted: false,
        userId: { $ne: null },
      },
    },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$userId", latest: { $first: "$_id" }, n: { $sum: 1 } } },
  ]);
  const alreadyDefault = await Location.countDocuments({
    type: { $ne: LOCATION_TYPES.VENDOR_BRANCH },
    isDeleted: false,
    isDefault: true,
  });
  if (alreadyDefault >= custDefaults.length && custDefaults.length > 0) {
    skip(`customer default addresses already set (${alreadyDefault})`);
  } else {
    act("set isDefault=true on latest customer address", custDefaults.length);
    act("User.locationId = default address", custDefaults.length);
    record("locations", "UPDATE", custDefaults.length);
    record("users", "UPDATE", custDefaults.length);
    if (APPLY) {
      for (const d of custDefaults) {
        await Location.updateMany(
          { userId: d._id, type: { $ne: LOCATION_TYPES.VENDOR_BRANCH }, isDefault: true },
          { $set: { isDefault: false } },
        );
        await Location.updateOne({ _id: d.latest }, { $set: { isDefault: true } });
        await User.updateOne({ _id: d._id }, { $set: { locationId: d.latest } });
      }
    }
  }

  // Deprecated flags hata do
  const withOldFlags = await Location.countDocuments({
    $or: [
      { isProductAddress: { $exists: true } },
      { isVendorAddress: { $exists: true } },
    ],
  });
  if (!withOldFlags) skip("deprecated flags already removed");
  else {
    act("$unset isProductAddress, isVendorAddress", withOldFlags);
    record("locations", "UNSET", withOldFlags);
    // NOTE: ye STEP 4 ke BAAD chalega — service areas inhi flags se bante hain
  }

  // ── STEP 4 — VendorServiceArea ─────────────────────────────
  step(4, "VendorServiceArea (D1 — exclusive territory)");

  const activeBranches = productAddrs.filter((l) => !l.isDeleted);
  const byZip = new Map();
  for (const l of activeBranches) {
    // ek zipcode ke multiple docs ho to sabse naya lo
    const prev = byZip.get(l.zipcode);
    if (!prev || new Date(l.createdAt) > new Date(prev.createdAt)) {
      byZip.set(l.zipcode, l);
    }
  }
  log(`   unique active zipcodes: ${byZip.size}`);

  const existingAreas = await VendorServiceArea.find({ isDeleted: false })
    .select("zipcode vendorId")
    .lean();
  const existingZips = new Set(existingAreas.map((a) => a.zipcode));

  const toCreate = [...byZip.values()].filter((l) => !existingZips.has(l.zipcode));
  if (!toCreate.length) {
    skip(`service areas already created (${existingAreas.length})`);
  } else {
    act("create VendorServiceArea rows", toCreate.length,
      `[${toCreate.map((l) => l.zipcode).sort().join(", ")}]`);
    record("vendorserviceareas", "INSERT", toCreate.length);
    if (APPLY) {
      await VendorServiceArea.insertMany(
        toCreate.map((l) => ({
          vendorId,
          locationId: l._id,
          zipcode: l.zipcode,
          city: l.city?.trim().toLowerCase(),
          district: l.district?.trim().toLowerCase(),
          state: l.state?.trim().toLowerCase(),
          country: (l.country || "india").toLowerCase(),
          isActive: true,
          isDeleted: false,
        })),
      );
    }
  }

  // Ab flags hata sakte hain (service areas ban chuke)
  if (withOldFlags && APPLY) {
    // ⚠️ `strict: false` ZARURI hai — ye dono fields ab Location schema me
    //    nahi hain, aur Mongoose unknown paths ko update se chup-chaap drop
    //    kar deta hai (unset chalta hi nahi tha).
    await Location.updateMany(
      {},
      { $unset: { isProductAddress: "", isVendorAddress: "" } },
      { strict: false },
    );
  }

  // ── STEP 5 — Catalog userId backfill ───────────────────────
  step(5, "Catalog — userId backfill (sabse zaruri step)");

  for (const [Model, label] of [
    [Category, "categories"],
    [SubCategory, "subcategories"],
    [Product, "products"],
  ]) {
    const n = await Model.countDocuments({
      $or: [{ userId: null }, { userId: { $exists: false } }],
    });
    if (!n) skip(`${label} — userId already set`);
    else {
      act(`${label} → userId = <vendor>`, n);
      record(label, "UPDATE", n);
      if (APPLY) {
        await Model.updateMany(
          { $or: [{ userId: null }, { userId: { $exists: false } }] },
          { $set: { userId: vendorId } },
        );
      }
    }
  }

  // ── STEP 6 — Product price/stock ← ProductLocation ─────────
  step(6, "Products — price/stock ProductLocation se (price as-is, stock MIN)");

  const svcLocIds = activeBranches.map((l) => l._id);
  const activeProducts = await Product.find({ isDeleted: false, isActive: true })
    .select("name generalPrice stockQuantity")
    .lean();

  const priceUpdates = [];
  const stockUpdates = [];
  for (const p of activeProducts) {
    // Raw collection — model register karne se collection wapas ban jaati
    const pls = await mongoose.connection.db
      .collection("productlocations")
      .find({
        productId: p._id,
        isDeleted: false,
        isActive: true,
        locationId: { $in: svcLocIds },
      })
      .project({ price: 1, stockQuantity: 1 })
      .toArray();
    if (!pls.length) continue;

    const newPrice = Math.min(...pls.map((x) => x.price));
    const newStock = Math.min(...pls.map((x) => x.stockQuantity));
    if (Number.isFinite(newPrice) && newPrice !== p.generalPrice) {
      priceUpdates.push({ _id: p._id, name: p.name, from: p.generalPrice, to: newPrice });
    }
    if (Number.isFinite(newStock) && newStock !== p.stockQuantity) {
      stockUpdates.push({ _id: p._id, name: p.name, from: p.stockQuantity, to: newStock });
    }
  }

  if (!priceUpdates.length) skip("product prices already aligned");
  else {
    act("products → generalPrice", priceUpdates.length);
    record("products", "UPDATE", priceUpdates.length);
    priceUpdates.forEach((u) => log(`       ${u.name.padEnd(24)} ₹${u.from} → ₹${u.to}`));
  }
  if (!stockUpdates.length) skip("product stock already aligned");
  else {
    act("products → stockQuantity (min)", stockUpdates.length);
    record("products", "UPDATE", stockUpdates.length);
    stockUpdates.slice(0, 25).forEach((u) =>
      log(`       ${u.name.padEnd(24)} ${String(u.from).padStart(5)} → ${String(u.to).padStart(5)}`),
    );
  }
  if (APPLY && (priceUpdates.length || stockUpdates.length)) {
    const ops = [
      ...priceUpdates.map((u) => ({
        updateOne: { filter: { _id: u._id }, update: { $set: { generalPrice: u.to } } },
      })),
      ...stockUpdates.map((u) => ({
        updateOne: { filter: { _id: u._id }, update: { $set: { stockQuantity: u.to } } },
      })),
    ];
    if (ops.length) await Product.bulkWrite(ops);
  }

  // ── STEP 7 — Carts clear ───────────────────────────────────
  step(7, "Carts clear (soft delete + items khali)");

  // ⚠️ Filter me `"items.0": { $exists: true }` NAHI — prod me aise carts
  //    bhi hain jinke items to khali hain par `totalWeight: 26`,
  //    `totalQuantity: 1` jaisa stale kachra pada hai (purane `removeItem`
  //    bug se). Unhe bhi normalize karna hai, warna shape naye code se
  //    alag reh jayega.
  const cartsToClear = await Cart.countDocuments({ isPurchased: false });
  const cartsNeedingWork = await Cart.countDocuments({
    isPurchased: false,
    $or: [
      { "items.0": { $exists: true } },
      { verifiedAt: { $exists: false } },
      { subTotal: { $ne: 0 } },
      { totalWeight: { $ne: 0 } },
      { totalQuantity: { $ne: 0 } },
    ],
  });
  if (!cartsNeedingWork) skip("carts already cleared");
  else {
    act("carts → isDeleted, items=[], totals=0, verifiedAt=null", cartsToClear);
    record("carts", "UPDATE", cartsToClear);
    warn(
      "Sirf isDeleted kaafi NAHI hai — addOrUpdateItem isDeleted filter nahi lagata aur purane items ke saath cart revive kar deta hai. Isliye items bhi khali kar rahe hain.",
    );
    if (APPLY) {
      // Shape bilkul wahi jo live code khali cart ka banata hai
      // (`removeItem` / `deleteCart` dekho):
      //   verifiedAt → null   (schema default null hai)
      //   vendorId / deliveryZipcode → $unset (inka default nahi hai)
      await Cart.updateMany(
        { isPurchased: false },
        {
          $set: {
            isDeleted: true,
            items: [],
            subTotal: 0,
            totalWeight: 0,
            totalQuantity: 0,
            verifiedAt: null,
          },
          $unset: { vendorId: "", deliveryZipcode: "" },
        },
      );
    }
  }
  const purchased = await Cart.countDocuments({ isPurchased: true });
  log(`   ✓ purchased carts (${purchased}) chhue nahi gaye`);

  // ── STEP 8 — Orders backfill ───────────────────────────────
  step(8, "Orders — vendorId / deliveryPincode / orderNumber / statusHistory");

  const orders = await Order.find({})
    .select(
      "locationId status vendorId deliveryPincode orderNumber statusHistory deliveredAt assignedTo items createdAt updatedAt",
    )
    .lean();

  // `productSnapshot` backfill ke liye saare products ek baar me
  const orderProductIds = [
    ...new Set(
      orders.flatMap((o) => (o.items || []).map((i) => String(i.productId))),
    ),
  ].filter(Boolean);
  const snapProducts = await Product.find({
    _id: { $in: orderProductIds.map((x) => new mongoose.Types.ObjectId(x)) },
  })
    .select("name brand SKU image weightInKg")
    .lean();
  const snapById = new Map(snapProducts.map((p) => [String(p._id), p]));
  log(
    `   productSnapshot ke liye ${snapById.size}/${orderProductIds.length} products mile`,
  );
  if (snapById.size < orderProductIds.length) {
    warn(
      `${orderProductIds.length - snapById.size} products ab maujood nahi — un items ka snapshot khali rahega`,
    );
  }

  const orderOps = [];
  // Per-month sequence — runtime `generateOrderNumber` bhi yahi format aur
  // yahi Counter collection use karta hai, isliye neeche counters seed
  // karna ZARURI hai (warna naya order purane number se takra jayega).
  const seqByMonth = {};
  const usedNumbers = new Set(orders.map((o) => o.orderNumber).filter(Boolean));
  // Pehle se assign numbers ko bhi counter me gino
  usedNumbers.forEach((num) => {
    const m = /^NVS-(\d{4})-(\d{6})$/.exec(num);
    if (m) {
      seqByMonth[m[1]] = Math.max(seqByMonth[m[1]] || 0, Number(m[2]));
    }
  });
  for (const o of orders.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))) {
    const set = {};
    if (!o.vendorId) {
      set.vendorId = vendorId;
      set.vendorLocationId = shopLocationId;
    }
    if (!o.deliveryPincode && o.locationId) {
      const loc = await Location.findById(o.locationId).select("zipcode").lean();
      if (loc?.zipcode) set.deliveryPincode = loc.zipcode;
    }
    if (!o.orderNumber) {
      const d = new Date(o.createdAt);
      const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
      let num;
      do {
        seqByMonth[ym] = (seqByMonth[ym] || 0) + 1;
        num = `NVS-${ym}-${String(seqByMonth[ym]).padStart(6, "0")}`;
      } while (usedNumbers.has(num));
      usedNumbers.add(num);
      set.orderNumber = num;
    }
    if (!o.statusHistory?.length) {
      set.statusHistory = [
        { status: o.status, changedByRole: "system", note: "migrated", at: o.updatedAt || o.createdAt },
      ];
    }
    // 49 DELIVERED orders me delivery date nahi hai. `updatedAt` hi sabse
    // sahi approximation hai jo data me maujood hai.
    if (o.status === ORDER_STATUS.DELIVERED && !o.deliveredAt) {
      set.deliveredAt = o.updatedAt || o.createdAt;
    }
    // Naye orders me schema default se `null` likha jata hai — purane me
    // field hi nahi. Shape same karne ke liye.
    if (o.assignedTo === undefined) {
      set.assignedTo = null;
      set.assignedAt = null;
    }
    // 🔑 productSnapshot — order ke waqt ka naam/image kabhi store hi nahi
    //    hua tha, isliye AAJ ka product data use kar rahe hain. `price`
    //    asli historical hi rehta hai (wo item me pehle se hai).
    const needSnap = (o.items || []).some((i) => !i.productSnapshot?.name);
    if (needSnap) {
      set.items = (o.items || []).map((i) => {
        const p = snapById.get(String(i.productId));
        return {
          productId: i.productId,
          quantity: i.quantity,
          price: i.price,
          productSnapshot: i.productSnapshot?.name
            ? i.productSnapshot
            : {
                name: p?.name ?? null,
                brand: p?.brand ?? null,
                SKU: p?.SKU ?? null,
                image: p?.image ?? null,
                weightInKg: p?.weightInKg ?? null,
              },
        };
      });
    }

    if (Object.keys(set).length) {
      // NOTE: purane `items[].locationId` / `items[].vendorId` ke liye alag
      // `$unset` ki zaroorat NAHI — `set.items` poore array ko naye shape se
      // replace kar deta hai (aur prod me wo dono fields 0/76 me hain).
      orderOps.push({ updateOne: { filter: { _id: o._id }, update: { $set: set } } });
    }
  }

  if (!orderOps.length) skip("orders already backfilled");
  else {
    act("orders → vendorId, vendorLocationId, deliveryPincode, orderNumber", orderOps.length);
    act("orders → statusHistory, deliveredAt, assignedTo/assignedAt", orderOps.length);
    act("orders → items[] rebuild (productSnapshot; vendorId/locationId gone)", orderOps.length);
    record("orders", "UPDATE", orderOps.length);
    if (APPLY) await Order.bulkWrite(orderOps);
  }

  // 🔑 Counter seed — warna migration ke NVS-2606-000001 se runtime ka
  // pehla order takra jayega (dono ka format aur collection same hai).
  const months = Object.keys(seqByMonth);
  if (!months.length) skip("orderNumber counters — kuch seed karne ko nahi");
  else {
    for (const ym of months) {
      const id = `order:${ym}`;
      const existing = await Counter.findById(id).lean();
      const want = seqByMonth[ym];
      if (existing && existing.seq >= want) {
        skip(`counter ${id} already >= ${want} (${existing.seq})`);
        continue;
      }
      act(`counter ${id} → seq ${want}`, 1);
      record("counters", existing ? "UPDATE" : "INSERT", 1);
      if (APPLY) {
        await Counter.updateOne(
          { _id: id },
          { $set: { seq: want } },
          { upsert: true },
        );
      }
    }
  }

  // ── STEP 9 — ProductLocation / Settings untouched ──────────
  step(9, "ProductLocation DROP · Settings → sirf platform hard caps");

  // Step 6 me isse price/stock nikal chuke hain — ab iska koi kaam nahi.
  // Naya code ise kabhi nahi padhta (D3). Data `mongodump` me safe rahega.
  const plExists = (
    await mongoose.connection.db.listCollections({ name: "productlocations" }).toArray()
  ).length;
  const plCount = plExists
    ? await mongoose.connection.db.collection("productlocations").countDocuments()
    : 0;
  if (!plExists) skip("productlocations already dropped");
  else {
    act("DROP productlocations collection", plCount, "naye code me koi role nahi");
    record("productlocations", "DROP", plCount);
    if (APPLY) {
      await mongoose.connection.db.collection("productlocations").drop();
    }
  }

  const DEAD_SETTING_FIELDS = [
    "shopLocationId", // vendor ka defaultLocationId ne replace kiya
    "baseCharge",
    "perKmRate",
    "perKgRate",
    "minDeliveryCharge",
    "baseMaxCharge",
    "maxPerKgIncrement",
    "maxPerKmIncrement",
    "distanceFactor",
    "weightFactor",
  ];
  const stillThere = DEAD_SETTING_FIELDS.filter(
    (f) => setting?.delivery?.[f] !== undefined,
  );
  if (!setting) {
    act("create Setting (platform hard caps)", 1, "maxRadiusKm 50, maxAllowedDeliveryCharge 200");
    record("settings", "INSERT", 1);
    if (APPLY) {
      await Setting.create({
        delivery: { maxRadiusKm: 50, maxAllowedDeliveryCharge: 200 },
      });
    }
  } else if (!stillThere.length) {
    skip("Setting already cleaned");
  } else {
    // Ye values ab vendor ke profile me chali gayi hain — yahan rehne dene
    // se confusion hoga ("kaunsa wala lagta hai?").
    act(`Setting.delivery se ${stillThere.length} dead fields $unset`, 1, stillThere.join(", "));
    act("Setting.delivery.maxAllowedDeliveryCharge = 200 (naya hard cap)", 1);
    record("settings", "UPDATE", 1);
    if (APPLY) {
      const unset = {};
      DEAD_SETTING_FIELDS.forEach((f) => {
        unset[`delivery.${f}`] = "";
      });
      await Setting.updateOne(
        { _id: setting._id },
        {
          $set: {
            "delivery.maxRadiusKm": setting.delivery?.maxRadiusKm ?? 50,
            "delivery.maxAllowedDeliveryCharge":
              setting.delivery?.maxAllowedDeliveryCharge ?? 200,
          },
          $unset: unset,
        },
        // strict:false zaruri hai — `distanceFactor`/`weightFactor` schema se
        // hata diye gaye hain, aur Mongoose unknown paths ko update se
        // chup-chaap drop kar deta hai (wo kabhi unset hote hi nahi the).
        { strict: false },
      );
    }
  }
  log(`   bachega → maxRadiusKm ${setting?.delivery?.maxRadiusKm ?? 50} km + maxAllowedDeliveryCharge ₹200`);
  log(`   ⚠️  shopLocationId rehne diya (deprecated, koi code nahi padhta)`);

  // ── STEP 10 — Indexes ──────────────────────────────────────
  step(10, "Indexes");
  if (SKIP_INDEXES) {
    log("   (--skip-indexes diya gaya hai)");
  } else {
    const db = mongoose.connection.db;

    // ── Bogus / orphan indexes drop ──────────────────────────
    // `location_2dsphere` → `location` naam ka field kabhi tha hi nahi.
    // `geo_2dsphere`      → schema se hata diya gaya (koi query use nahi
    //                       karti), par autoIndex ne prod me bana diya tha.
    const BOGUS = [
      ["locations", "location_2dsphere"],
      ["locations", "geo_2dsphere"],
    ];
    for (const [coll, idxName] of BOGUS) {
      try {
        const idx = await db.collection(coll).indexes();
        if (idx.some((i) => i.name === idxName)) {
          act(`DROP ${coll}.${idxName}`, 1);
          if (APPLY) await db.collection(coll).dropIndex(idxName);
        } else skip(`${coll}.${idxName} already dropped`);
      } catch (e) {
        warn(`drop ${coll}.${idxName} skip: ${e.message}`);
      }
    }

    const UNIQUE_INDEXES = [
      ["users", { email: 1, role: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" }, isDeleted: false } }],
      ["users", { mobile: 1, role: 1 }, { unique: true, partialFilterExpression: { mobile: { $type: "string" }, isDeleted: false } }],
      ["categories", { userId: 1, name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } }],
      ["subcategories", { categoryId: 1, name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } }],
      ["products", { userId: 1, SKU: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } }],
      ["orders", { orderNumber: 1 }, { unique: true, sparse: true }],
    ];
    for (const [coll, keys, opts] of UNIQUE_INDEXES) {
      // ⚠️ Agar same KEY ka index alag options ke saath pehle se hai (jaise
      //    `autoIndex` ne non-unique bana diya ho), to `createIndex`
      //    `IndexOptionsConflict` deta hai aur unique index chup-chaap
      //    ban hi nahi pata. Isliye pehle conflicting wala drop karo.
      let conflicting = null;
      try {
        const existing = await db.collection(coll).indexes();
        conflicting = existing.find(
          (i) =>
            i.name !== "_id_" &&
            JSON.stringify(i.key) === JSON.stringify(keys) &&
            i.unique !== true,
        );
      } catch {
        /* collection abhi bani hi nahi */
      }
      if (conflicting) {
        act(`DROP ${coll}.${conflicting.name} (non-unique, conflict karega)`, 1);
        if (APPLY) {
          await db.collection(coll).dropIndex(conflicting.name).catch((e) =>
            warn(`drop ${conflicting.name}: ${e.message}`),
          );
        }
      }
      act(`CREATE ${coll} ${JSON.stringify(keys)} UNIQUE`, 1);
      if (APPLY) {
        try {
          await db.collection(coll).createIndex(keys, { ...opts, background: true });
        } catch (e) {
          warn(`${coll} ${JSON.stringify(keys)} → ${e.message}`);
        }
      }
    }

    // Schema-declared (non-unique) indexes
    act("syncIndexes() — schema ke saare non-unique indexes", 1);
    if (APPLY) {
      for (const M of [User, Location, Category, SubCategory, Product, Cart, Order, VendorProfile, VendorServiceArea]) {
        try {
          await M.createIndexes();
        } catch (e) {
          warn(`${M.modelName}.createIndexes → ${e.message}`);
        }
      }
    }
  }

  // ── SUMMARY ────────────────────────────────────────────────
  step("✔", "SUMMARY");
  const agg = {};
  summary.forEach((s) => {
    agg[s.coll] = agg[s.coll] || { INSERT: 0, UPDATE: 0, UNSET: 0, DROP: 0 };
    agg[s.coll][s.op] += s.count;
  });
  log(
    `   ${"collection".padEnd(22)} ${"INSERT".padStart(7)} ${"UPDATE".padStart(7)} ${"UNSET".padStart(7)} ${"DROP".padStart(7)}`,
  );
  log(`   ${"-".repeat(22)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)}`);
  Object.entries(agg).forEach(([c, o]) =>
    log(
      `   ${c.padEnd(22)} ${String(o.INSERT).padStart(7)} ${String(o.UPDATE).padStart(7)} ${String(o.UNSET).padStart(7)} ${String(o.DROP).padStart(7)}`,
    ),
  );
  if (!summary.length) log("   (kuch karne ko nahi — migration already complete hai)");

  // ── VERIFY ─────────────────────────────────────────────────
  if (APPLY) {
    step("✔", "VERIFY");
    const checks = [
      ["products with null userId", await Product.countDocuments({ userId: null }), 0],
      ["categories with null userId", await Category.countDocuments({ userId: null }), 0],
      ["subcategories with null userId", await SubCategory.countDocuments({ userId: null }), 0],
      ["locations with null type", await Location.countDocuments({ type: null }), 0],
      ["vendor default branches", await Location.countDocuments({ userId: vendorId, type: LOCATION_TYPES.VENDOR_BRANCH, isDefault: true }), 1],
      ["service areas", await VendorServiceArea.countDocuments({ isDeleted: false }), byZip.size],
      ["orders without vendorId", await Order.countDocuments({ vendorId: null }), 0],
      ["orders without deliveryPincode", await Order.countDocuments({ deliveryPincode: null }), 0],
      ["non-empty unpurchased carts", await Cart.countDocuments({ isPurchased: false, "items.0": { $exists: true } }), 0],
      ["orders without productSnapshot", await Order.countDocuments({ "items.productSnapshot.name": { $exists: false }, "items.0": { $exists: true } }), 0],
      ["DELIVERED orders without deliveredAt", await Order.countDocuments({ status: ORDER_STATUS.DELIVERED, deliveredAt: null }), 0],
      ["items[].vendorId bacha hua", await Order.countDocuments({ "items.vendorId": { $exists: true } }), 0],
      ["locations with isProductAddress", await Location.countDocuments({ isProductAddress: { $exists: true } }), 0],
    ];
    let bad = 0;
    checks.forEach(([label, got, want]) => {
      const okay = got === want;
      if (!okay) bad++;
      log(`   ${okay ? "✅" : "❌"} ${label.padEnd(36)} ${got} (expected ${want})`);
    });
    log(bad ? `\n   ⚠️  ${bad} check fail — review karo` : "\n   ✅ saare checks pass");
  }

  log(
    APPLY
      ? "\n✅ MIGRATION APPLIED\n"
      : "\n🔍 DRY RUN complete — likhne ke liye `--apply` lagao\n",
  );
  await mongoose.disconnect();
};

run().catch(async (e) => {
  console.error("\n❌", e.message);
  console.error(e.stack);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
