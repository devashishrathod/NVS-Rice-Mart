/* eslint-disable no-console */
/**
 * PROD DB AUDIT — 100% READ-ONLY.
 *
 *   MONGO_URL="<prod-uri>" node scripts/prodAudit.js
 *
 * Migration se PEHLE prod ki asli haalat dekhne ke liye. Batata hai:
 *   - kya-kya migration ko karna padega (aur kitna)
 *   - kahin kuch aisa to nahi jo migration ko fail kara de
 *   - customers pe kya asar padega (kitno ko address screen dikhegi)
 *
 * 🔒 SAFETY
 *   - Mongoose **bilkul use nahi** hota. Mongoose model register karte hi
 *     `autoIndex` prod pe collections aur indexes bana deta hai — yahi galti
 *     pehle ho chuki hai (runbook §1.10). Isliye yahan raw MongoClient hai.
 *   - Sirf find / countDocuments / aggregate / listCollections / indexes.
 *     Koi insert, update, delete, drop, createIndex — kuch nahi.
 */
require("dotenv").config();
// Mongoose ka bundled driver — `require("mongoose")` sirf library load karta
// hai, koi model register nahi hota, isliye `autoIndex` chal hi nahi sakta.
const { MongoClient, ObjectId } = require("mongoose").mongo;

const URI = process.env.MONGO_URL;
if (!URI) {
  console.error("❌ MONGO_URL nahi diya");
  process.exit(1);
}

const log = (s = "") => console.log(s);
const hr = (t) => log(`\n${"═".repeat(78)}\n  ${t}\n${"═".repeat(78)}`);
const sub = (t) => log(`\n── ${t} ${"─".repeat(Math.max(0, 72 - t.length))}`);
const row = (label, value, note = "") =>
  log(`   ${String(label).padEnd(44)} ${String(value).padStart(7)}  ${note}`);

/** Migration ke liye important findings — aakhir me ek saath dikhte hain. */
const FINDINGS = { blocker: [], warn: [], info: [] };
const blocker = (s) => FINDINGS.blocker.push(s);
const warn = (s) => FINDINGS.warn.push(s);
const info = (s) => FINDINGS.info.push(s);

const run = async () => {
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db();
  const dbName = db.databaseName;

  hr(`PROD AUDIT — ${dbName}   (READ-ONLY)`);
  log(`   waqt: ${new Date().toISOString()}`);
  if (!/prod/i.test(dbName)) {
    log(`\n   ⚠️  DB ka naam "${dbName}" hai — ye prod nahi lagta. Sahi URI hai?`);
  }

  // ═══════════════════════════════════════════════════════════
  hr("1. COLLECTIONS");
  const colls = (await db.listCollections().toArray()).map((c) => c.name).sort();
  const counts = {};
  for (const c of colls) counts[c] = await db.collection(c).countDocuments();
  colls.forEach((c) => row(c, counts[c]));

  // Ye DB migrate ho chuki hai ya nahi — iske hisaab se aage ke sawal badalte
  // hain (migration `isProductAddress` unset kar deti hai, isliye branches
  // dhoondhne ka tarika bhi badal jata hai).
  const MIGRATED =
    (counts.vendorserviceareas || 0) > 0 ||
    (await db.collection("locations").countDocuments({ type: { $exists: true, $ne: null } })) > 0;
  log(`
   STATE: ${MIGRATED ? "MIGRATED (migration chal chuki hai)" : "PRE-MIGRATION (abhi tak nahi chali)"}`);

  const EXPECTED_NEW = ["vendorprofiles", "vendorserviceareas", "counters"];
  const newAlready = EXPECTED_NEW.filter((c) => colls.includes(c));
  if (newAlready.length) {
    const withData = newAlready.filter((c) => counts[c] > 0);
    if (withData.length && MIGRATED) {
      info(
        `${withData.map((c) => `${c}(${counts[c]})`).join(", ")} — migration ne banayi hain, sahi hai`,
      );
    } else if (withData.length) {
      blocker(
        `Naye code ki collections me DATA hai: ${withData
          .map((c) => `${c}(${counts[c]})`)
          .join(", ")} — matlab naya code prod pe chal chuka hai. Migration se pehle dekhna zaroori.`,
      );
    } else {
      warn(
        `${newAlready.join(", ")} khali bani hui hain (0 docs) — kisi ne naye code se connect kiya tha. Khali hain to migration theek chalegi.`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  hr("2. INDEXES — naye code ke nishaan aur conflicts");
  const idxByColl = {};
  for (const c of colls) {
    try {
      idxByColl[c] = await db.collection(c).indexes();
    } catch {
      idxByColl[c] = [];
    }
  }

  sub("locations");
  (idxByColl.locations || []).forEach((i) =>
    log(`   ${i.name.padEnd(46)} ${JSON.stringify(i.key)}${i.unique ? "  UNIQUE" : ""}`),
  );
  const bogus = ["location_2dsphere", "geo_2dsphere"].filter((n) =>
    (idxByColl.locations || []).some((i) => i.name === n),
  );
  if (bogus.length) info(`locations pe bekaar indexes: ${bogus.join(", ")} — migration drop kar degi`);

  sub("orders");
  (idxByColl.orders || []).forEach((i) =>
    log(`   ${i.name.padEnd(46)} ${JSON.stringify(i.key)}${i.unique ? "  UNIQUE" : ""}`),
  );
  const onIdx = (idxByColl.orders || []).find((i) => i.name === "orderNumber_1");
  if (onIdx && onIdx.unique !== true) {
    warn(
      "orders.orderNumber_1 index NON-UNIQUE hai — migration pehle ise drop karke unique banayegi (runbook §1.2 wala bug).",
    );
  }

  sub("users");
  (idxByColl.users || []).forEach((i) =>
    log(`   ${i.name.padEnd(46)} ${JSON.stringify(i.key)}${i.unique ? "  UNIQUE" : ""}`),
  );

  // ═══════════════════════════════════════════════════════════
  hr("3. BLOCKERS — unique index banne se pehle saaf hone chahiye");

  const BLOCK_IDS = [
    "6a1e620ec30c2b2ad899245b",
    "6a943efba359116c474ca779",
    "6a943efba359116c474ca77a",
  ];
  for (const id of BLOCK_IDS) {
    let u = null;
    try {
      u = await db.collection("users").findOne({ _id: new ObjectId(id) });
    } catch {
      /* invalid id */
    }
    if (!u) {
      row(`${id.slice(-6)} — user`, "nahi", "already saaf / exist nahi karta");
      continue;
    }
    const orders = await db.collection("orders").countDocuments({ userId: u._id });
    row(
      `${id.slice(-6)} — ${u.mobile || u.email || "?"}`,
      orders,
      `orders · isDeleted=${u.isDeleted}`,
    );
    if (orders > 0) {
      blocker(
        `User ${id} ke ${orders} orders hain — migration ABORT kar degi (script me hard check hai). Pehle review karna padega.`,
      );
    }
  }

  sub("Duplicate {mobile, role} — inpe unique index fail hoga");
  const dupes = await db
    .collection("users")
    .aggregate([
      { $match: { mobile: { $exists: true, $ne: null }, isDeleted: false } },
      { $group: { _id: { m: "$mobile", r: "$role" }, n: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  const dupesAfterCleanup = dupes.filter(
    (d) => d.ids.filter((i) => !BLOCK_IDS.includes(String(i))).length > 1,
  );
  row("duplicate {mobile, role} groups", dupes.length);
  row("...jo blockers hatane ke BAAD bhi bachenge", dupesAfterCleanup.length);
  dupesAfterCleanup.forEach((d) => log(`      ${d._id.m} (${d._id.r}) → ${d.n} users`));
  if (dupesAfterCleanup.length) {
    blocker(
      `${dupesAfterCleanup.length} duplicate {mobile, role} bachenge — users ka unique index BAN HI NAHI PAYEGA. Pehle inhe resolve karo.`,
    );
  }

  sub("Duplicate {email, role}");
  const dupeEmail = await db
    .collection("users")
    .aggregate([
      { $match: { email: { $exists: true, $ne: null }, isDeleted: false } },
      { $group: { _id: { e: "$email", r: "$role" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  row("duplicate {email, role} groups", dupeEmail.length);
  dupeEmail.forEach((d) => log(`      ${d._id.e} (${d._id.r}) → ${d.n}`));
  if (dupeEmail.length) blocker(`${dupeEmail.length} duplicate {email, role} — unique index fail hoga.`);

  sub("Duplicate catalog names (naye unique indexes ke liye)");
  for (const [coll, keys, label] of [
    ["categories", ["userId", "name"], "categories {userId, name}"],
    ["subcategories", ["categoryId", "name"], "subcategories {categoryId, name}"],
    ["products", ["userId", "SKU"], "products {userId, SKU}"],
  ]) {
    // migration ke BAAD userId sab pe same vendor hoga, isliye userId ignore
    // karke sirf naam/SKU pe duplicate dekhte hain — wahi asli risk hai
    const [scope, field] = keys;
    // Unique index POORE key pe hai. `userId` migration ke baad sab pe same
    // vendor hoga, isliye usko ignore karke sirf naam dekhte hain — par
    // `categoryId` asli scope hai, use group me rakhna padta hai.
    const groupId =
      scope === "userId"
        ? { v: { $toLower: `$${field}` } }
        : { s: `$${scope}`, v: { $toLower: `$${field}` } };
    const d = await db
      .collection(coll)
      .aggregate([
        { $match: { isDeleted: false, [field]: { $exists: true, $ne: null } } },
        { $group: { _id: groupId, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
      ])
      .toArray();
    row(label, d.length, d.length ? `⚠️ ${d.slice(0, 5).map((x) => x._id.v).join(", ")}` : "");
    if (d.length) {
      blocker(
        `${coll} me ${d.length} duplicate ${field} (case-insensitive) — unique index nahi banega: ${d
          .slice(0, 5)
          .map((x) => x._id)
          .join(", ")}`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  hr("4. CATALOG — userId backfill ka scope");
  for (const c of ["categories", "subcategories", "products"]) {
    const total = counts[c] || 0;
    const nullUser = await db
      .collection(c)
      .countDocuments({ $or: [{ userId: null }, { userId: { $exists: false } }] });
    const active = await db.collection(c).countDocuments({ isDeleted: false });
    row(c, total, `active ${active} · userId missing ${nullUser}`);
    if (nullUser === total && total > 0) {
      info(`${c}: saare ${total} docs pe userId lagega (abhi kisi pe nahi hai) — ye migration ka SABSE ZARURI step hai`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  hr("5. LOCATIONS");
  const locTotal = counts.locations || 0;
  const branches = MIGRATED
    ? await db.collection("locations").find({ type: "VENDOR_BRANCH" }).toArray()
    : await db.collection("locations").find({ isProductAddress: true }).toArray();
  const branchesByType = await db
    .collection("locations")
    .countDocuments({ type: "VENDOR_BRANCH" });
  const noType = await db
    .collection("locations")
    .countDocuments({ $or: [{ type: null }, { type: { $exists: false } }] });
  const withOldFlag = await db
    .collection("locations")
    .countDocuments({
      $or: [{ isProductAddress: { $exists: true } }, { isVendorAddress: { $exists: true } }],
    });
  const anyDefault = await db.collection("locations").countDocuments({ isDefault: true });

  row("total locations", locTotal);
  row("vendor branches (isProductAddress: true)", branches.length);
  row("vendor branches (type: VENDOR_BRANCH)", branchesByType);
  row("bina `type` wale", noType, noType ? "migration type set karegi" : "");
  row("isProductAddress / isVendorAddress wale", withOldFlag, "migration unset karegi");
  row("isDefault: true", anyDefault, anyDefault ? "" : "koi default address nahi hai abhi");

  sub("Vendor branches ka detail");
  branches.forEach((b) =>
    log(
      `   ${String(b.zipcode).padEnd(8)} ${JSON.stringify(b.coordinates || []).padEnd(26)} ${
        b.isDeleted ? "[deleted] " : "          "
      }${String(b.city || "").slice(0, 20)}`,
    ),
  );
  const activeBranches = branches.filter((b) => !b.isDeleted);
  const serviceZips = MIGRATED
    ? (
        await db
          .collection("vendorserviceareas")
          .find({ isDeleted: false })
          .project({ zipcode: 1 })
          .toArray()
      )
        .map((a) => a.zipcode)
        .sort()
    : [...new Set(activeBranches.map((b) => b.zipcode))].sort();
  row(
    MIGRATED ? "service areas (VendorServiceArea se)" : "unique ACTIVE zipcodes → service areas banenge",
    serviceZips.length,
    serviceZips.join(", "),
  );

  if (!activeBranches.length) {
    blocker(
      MIGRATED
        ? "Koi VENDOR_BRANCH location nahi mili — har order 503 VENDOR_PICKUP_MISSING dega!"
        : "Koi active vendor branch nahi mili — migration pickup branch ke bina ABORT kar degi.",
    );
  }
  if (MIGRATED && !serviceZips.length) {
    blocker("Ek bhi VendorServiceArea nahi — har customer ko 404 PINCODE_NOT_SERVICEABLE milega!");
  }

  const GOOD = [14.464, 75.92];
  const badCoords = branches.filter(
    (b) => Array.isArray(b.coordinates) && Math.abs((b.coordinates[0] ?? 0) - GOOD[0]) > 0.1,
  );
  if (badCoords.length) {
    info(
      `${badCoords.length} branch ke coordinates galat hain (${badCoords
        .map((b) => b.zipcode)
        .join(", ")}) — migration ${JSON.stringify(GOOD)} set kar degi`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  hr("6. CUSTOMERS PE ASAR — migration ke baad kisko kya dikhega");
  const totalUsers = counts.users || 0;
  const customers = await db.collection("users").countDocuments({ role: "user", isDeleted: false });
  const vendors = await db.collection("users").countDocuments({ role: "vendor", isDeleted: false });
  const admins = await db.collection("users").countDocuments({ role: "admin", isDeleted: false });
  row("users total", totalUsers, `customer ${customers} · vendor ${vendors} · admin ${admins}`);

  const withAddr = await db
    .collection("locations")
    .aggregate([
      { $match: { isDeleted: false, isProductAddress: { $ne: true } } },
      { $group: { _id: "$userId" } },
      { $count: "n" },
    ])
    .toArray();
  const custWithAddr = withAddr[0]?.n || 0;

  const inArea = await db
    .collection("locations")
    .aggregate([
      {
        $match: {
          isDeleted: false,
          type: { $ne: "VENDOR_BRANCH" },
          zipcode: { $in: serviceZips },
        },
      },
      { $group: { _id: "$userId" } },
      { $count: "n" },
    ])
    .toArray();
  const custInArea = inArea[0]?.n || 0;

  const outArea = await db
    .collection("locations")
    .aggregate([
      {
        $match: {
          isDeleted: false,
          type: { $ne: "VENDOR_BRANCH" },
          zipcode: { $nin: serviceZips },
        },
      },
      { $group: { _id: "$userId" } },
      { $count: "n" },
    ])
    .toArray();
  const custOutArea = outArea[0]?.n || 0;

  const noAddr = customers - custWithAddr;
  const pct = (n) => `${((n / Math.max(customers, 1)) * 100).toFixed(1)}%`;

  row("customers jinke paas address hai", custWithAddr, pct(custWithAddr));
  row("  ...service area ke ANDAR", custInArea, `${pct(custInArea)} → catalog 200 ✅`);
  row("  ...service area ke BAHAR", custOutArea, `${pct(custOutArea)} → 404 PINCODE_NOT_SERVICEABLE`);
  row("customers jinke paas KOI address nahi", noAddr, `${pct(noAddr)} → 400 PINCODE_REQUIRED`);

  if (noAddr > customers * 0.5) {
    warn(
      `${noAddr} customers (${pct(noAddr)}) ke paas address hi nahi — migration ke baad unhe pehli screen pe "address add karo" dikhana ZARURI hai, warna unke liye app khali dikhegi. App release iske saath hi jani chahiye.`,
    );
  }
  if (custOutArea > 0) {
    info(`${custOutArea} customers service area ke bahar — unhe "coming soon" screen chahiye`);
  }

  sub("Zipcode distribution (top 12 customer pincodes)");
  const zipDist = await db
    .collection("locations")
    .aggregate([
      { $match: { isDeleted: false, isProductAddress: { $ne: true } } },
      { $group: { _id: "$zipcode", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 12 },
    ])
    .toArray();
  zipDist.forEach((z) =>
    row(z._id || "(khali)", z.n, serviceZips.includes(z._id) ? "✅ serviceable" : "❌ bahar"),
  );

  // ═══════════════════════════════════════════════════════════
  hr("7. ORDERS");
  const ordTotal = counts.orders || 0;
  // NOTE: `{vendorId: null}` missing field ko bhi match karta hai, isliye
  // dono ko alag-alag ginne se double count ho jata tha.
  const noVendor = await db
    .collection("orders")
    .countDocuments({ $or: [{ vendorId: null }, { vendorId: { $exists: false } }] });
  const noOrderNum = await db
    .collection("orders")
    .countDocuments({ $or: [{ orderNumber: null }, { orderNumber: { $exists: false } }] });
  const noPincode = await db
    .collection("orders")
    .countDocuments({ $or: [{ deliveryPincode: null }, { deliveryPincode: { $exists: false } }] });
  const noHistory = await db
    .collection("orders")
    .countDocuments({ $or: [{ statusHistory: { $size: 0 } }, { statusHistory: { $exists: false } }] });
  const noSnap = await db
    .collection("orders")
    .countDocuments({ "items.0": { $exists: true }, "items.productSnapshot.name": { $exists: false } });
  const delivered = await db.collection("orders").countDocuments({ status: "DELIVERED" });
  const deliveredNoDate = await db
    .collection("orders")
    .countDocuments({ status: "DELIVERED", $or: [{ deliveredAt: null }, { deliveredAt: { $exists: false } }] });
  const itemVendorId = await db.collection("orders").countDocuments({ "items.vendorId": { $exists: true } });
  const itemLocId = await db.collection("orders").countDocuments({ "items.locationId": { $exists: true } });

  row("total orders", ordTotal);
  row("bina vendorId", noVendor, "migration set karegi");
  row("bina orderNumber", noOrderNum, "migration NVS-YYMM-NNNNNN degi");
  row("bina deliveryPincode", noPincode, "migration location se nikalegi");
  row("bina statusHistory", noHistory, "migration seed karegi");
  row("bina productSnapshot", noSnap, "migration aaj ke product data se bharegi");
  row("DELIVERED orders", delivered, `inme se ${deliveredNoDate} bina deliveredAt`);
  row("items[].vendorId bacha hua", itemVendorId, "migration items rebuild karegi");
  row("items[].locationId bacha hua", itemLocId);

  sub("Status distribution");
  const statusDist = await db
    .collection("orders")
    .aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }, { $sort: { n: -1 } }])
    .toArray();
  statusDist.forEach((s) => row(s._id || "(khali)", s.n));

  const stuck = statusDist.find((s) => s._id === "PENDING")?.n || 0;
  if (stuck > 0) {
    warn(
      `${stuck} orders abhi PENDING me hain. Migration inhe chhuegi nahi, par naye flow me inhe vendor hi aage badha sakta hai — vendor ko bata dena.`,
    );
  }

  sub("orderNumber ke existing prefixes (counter seed ke liye)");
  const nums = await db
    .collection("orders")
    .find({ orderNumber: { $exists: true, $ne: null } })
    .project({ orderNumber: 1 })
    .toArray();
  const byMonth = {};
  nums.forEach((o) => {
    const m = /^NVS-(\d{4})-(\d{6})$/.exec(o.orderNumber);
    if (m) byMonth[m[1]] = Math.max(byMonth[m[1]] || 0, Number(m[2]));
  });
  if (!nums.length) log("   (kisi order pe orderNumber nahi — sab migration me banenge)");
  Object.entries(byMonth).forEach(([ym, max]) => row(`NVS-${ym}-*`, max, "max sequence"));

  const monthsFromDates = await db
    .collection("orders")
    .aggregate([
      {
        $group: {
          // `%y` MongoDB me valid nahi hai — `%Y` (4 digit) se last 2 kaatte hain
          _id: {
            $concat: [
              { $substrCP: [{ $dateToString: { format: "%Y", date: "$createdAt" } }, 2, 2] },
              { $dateToString: { format: "%m", date: "$createdAt" } },
            ],
          },
          n: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  sub("Orders per month (migration itne counters seed karegi)");
  monthsFromDates.forEach((m) => row(`order:${m._id}`, m.n));

  // ═══════════════════════════════════════════════════════════
  hr("8. CARTS");
  const cartTotal = counts.carts || 0;
  const purchased = await db.collection("carts").countDocuments({ isPurchased: true });
  const unpurchased = await db.collection("carts").countDocuments({ isPurchased: false });
  const withItems = await db
    .collection("carts")
    .countDocuments({ isPurchased: false, "items.0": { $exists: true } });
  const staleTotals = await db.collection("carts").countDocuments({
    isPurchased: false,
    "items.0": { $exists: false },
    $or: [{ subTotal: { $ne: 0 } }, { totalWeight: { $ne: 0 } }, { totalQuantity: { $ne: 0 } }],
  });
  row("total carts", cartTotal);
  row("purchased (chhue nahi jayenge)", purchased);
  row("unpurchased (clear honge)", unpurchased);
  row("  ...jinme items hain", withItems);
  row("  ...khali par stale totals wale", staleTotals, "runbook §1.6");
  if (withItems > 0) {
    info(`${withItems} customers ke cart me items hain — migration unhe clear kar degi. Unhe dobara add karna padega.`);
  }

  // ═══════════════════════════════════════════════════════════
  hr("9. SETTINGS");
  const setting = await db.collection("settings").findOne({});
  if (!setting) {
    info("Koi Setting doc nahi — migration naya bana degi (maxRadiusKm 50, maxAllowedDeliveryCharge 200)");
  } else {
    const d = setting.delivery || {};
    log(`   delivery: ${JSON.stringify(d, null, 2).split("\n").join("\n   ")}`);
    const DEAD = [
      "shopLocationId", "baseCharge", "perKmRate", "perKgRate", "minDeliveryCharge",
      "baseMaxCharge", "maxPerKgIncrement", "maxPerKmIncrement", "distanceFactor", "weightFactor",
    ];
    const present = DEAD.filter((f) => d[f] !== undefined);
    row("dead fields jo unset honge", present.length, present.join(", "));
    if (d.shopLocationId) {
      const sl = await db.collection("locations").findOne({ _id: d.shopLocationId });
      row("shopLocationId ki location", sl ? "mili" : "NAHI MILI", sl ? `${sl.zipcode}` : "");
      if (!sl) {
        warn("Setting.delivery.shopLocationId ki location nahi mili — migration fallback se pickup branch dhoondhegi.");
      } else {
        info(`Pickup branch = ${sl.zipcode} (${sl._id}) — isse delivery distance naapi jayegi`);
      }
    } else {
      if (MIGRATED) {
        info("Setting.delivery.shopLocationId hata diya gaya — sahi hai, ab vendor ka defaultLocationId use hota hai");
      } else {
        warn("Setting.delivery.shopLocationId set nahi hai — migration fallback use karegi (sabse purani product-address).");
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  hr("10. PRODUCTLOCATION — price/stock ka source");
  if (!colls.includes("productlocations")) {
    info("productlocations collection hai hi nahi — price/stock Product pe hi rahenge");
  } else {
    const plTotal = counts.productlocations;
    const plActive = await db
      .collection("productlocations")
      .countDocuments({ isDeleted: false, isActive: true });
    row("total rows", plTotal, `active ${plActive}`);

    const branchIds = activeBranches.map((b) => b._id);
    const products = await db
      .collection("products")
      .find({ isDeleted: false, isActive: true })
      .project({ name: 1, generalPrice: 1, stockQuantity: 1 })
      .toArray();

    let priceDiff = 0;
    let stockDiff = 0;
    const priceRows = [];
    for (const p of products) {
      const pls = await db
        .collection("productlocations")
        .find({ productId: p._id, isDeleted: false, isActive: true, locationId: { $in: branchIds } })
        .project({ price: 1, stockQuantity: 1 })
        .toArray();
      if (!pls.length) continue;
      const np = Math.min(...pls.map((x) => x.price));
      const ns = Math.min(...pls.map((x) => x.stockQuantity));
      if (Number.isFinite(np) && np !== p.generalPrice) {
        priceDiff++;
        priceRows.push(`${p.name}: ₹${p.generalPrice} → ₹${np}`);
      }
      if (Number.isFinite(ns) && ns !== p.stockQuantity) stockDiff++;
    }
    row("products jinka PRICE badlega", priceDiff);
    priceRows.forEach((r) => log(`      ${r}`));
    row("products jinka STOCK badlega", stockDiff, "PL ka minimum lagega");
    if (priceDiff > 0) {
      warn(
        `${priceDiff} product ka price badlega: ${priceRows.join(" | ")} — vendor se confirm kar lena.`,
      );
    }
    info(`productlocations (${plTotal} rows) DROP hogi — mongodump me safe rahegi`);
  }

  // ═══════════════════════════════════════════════════════════
  hr("11. TEXT CASING — backfillTextCase ka scope (approx)");
  const casingChecks = [
    ["locations", ["name", "address", "area", "city", "district", "state"]],
    ["users", ["name"]],
    ["categories", ["name"]],
    ["subcategories", ["name"]],
    ["products", ["name", "brand"]],
  ];
  for (const [coll, fields] of casingChecks) {
    if (!colls.includes(coll)) continue;
    let n = 0;
    for (const f of fields) {
      // sab-lowercase strings = purane `.toLowerCase()` ka nishaan
      n += await db.collection(coll).countDocuments({
        [f]: { $exists: true, $type: "string", $ne: "", $not: /[A-Z]/ },
      });
    }
    row(`${coll} (${fields.join("/")})`, n, "lowercase docs — title case honge");
  }

  sub("Duplicate addresses (dedupe ka scope)");
  const dupAddr = await db
    .collection("locations")
    .aggregate([
      { $match: { isDeleted: false, isProductAddress: { $ne: true } } },
      {
        $group: {
          _id: {
            u: "$userId",
            a: { $toLower: { $ifNull: ["$address", ""] } },
            z: "$zipcode",
          },
          n: { $sum: 1 },
        },
      },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  const wasted = dupAddr.reduce((s, d) => s + d.n - 1, 0);
  row("duplicate address groups", dupAddr.length, `${wasted} extra docs soft-delete honge`);

  sub("Multi-address customers");
  const multi = await db
    .collection("locations")
    .aggregate([
      { $match: { isDeleted: false, isProductAddress: { $ne: true } } },
      { $group: { _id: "$userId", n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();
  row("customers with >1 address", multi.length, multi.length ? `max ${multi[0].n} addresses` : "");

  // ═══════════════════════════════════════════════════════════
  hr("12. DB SIZE — backup planning");
  try {
    const stats = await db.command({ dbStats: 1, scale: 1024 * 1024 });
    row("dataSize", `${stats.dataSize?.toFixed(1)} MB`);
    row("storageSize", `${stats.storageSize?.toFixed(1)} MB`);
    row("indexSize", `${stats.indexSize?.toFixed(1)} MB`);
    row("objects", stats.objects);
  } catch (e) {
    log(`   (dbStats nahi mila: ${e.message})`);
  }

  // ═══════════════════════════════════════════════════════════
  hr("VERDICT");
  const print = (label, arr, icon) => {
    if (!arr.length) return;
    log(`\n  ${icon} ${label} (${arr.length})`);
    arr.forEach((s, i) => log(`     ${i + 1}. ${s}`));
  };
  print("BLOCKER — migration se pehle theek karo", FINDINGS.blocker, "🔴");
  print("DHYAN DENE LAYAK", FINDINGS.warn, "🟠");
  print("JAANKARI — migration ye karegi", FINDINGS.info, "🔵");

  log(
    FINDINGS.blocker.length
      ? `\n  🔴 ${FINDINGS.blocker.length} BLOCKER hai — migration abhi mat chalao.\n`
      : "\n  ✅ Koi blocker nahi — migration chal sakti hai (dry run se shuru karo).\n",
  );

  await client.close();
};

run().catch(async (e) => {
  console.error("\n💥", e.message);
  console.error(e.stack);
  process.exit(1);
});
