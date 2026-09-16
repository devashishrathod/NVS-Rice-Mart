/* eslint-disable no-console */
/**
 * Purane data ki CASING theek karti hai + duplicate addresses saaf karti hai.
 *
 *   node scripts/backfillTextCase.js                 # DRY RUN (default)
 *   node scripts/backfillTextCase.js --apply         # asli writes
 *   node scripts/backfillTextCase.js --only=locations
 *   node scripts/backfillTextCase.js --no-dedupe     # sirf casing
 *   node scripts/backfillTextCase.js --no-orders     # order snapshots chhodo
 *   node scripts/backfillTextCase.js --undo=<file>   # sab wapas
 *
 * 🔙 `--apply` har change ka purana value ek UNDO FILE me likhta hai
 *    (`scripts/.backfill-undo-*.json`). Usse poora DB restore kiye bina
 *    exactly yahi changes reverse ho jate hain.
 *
 * ❓ Kyun: aaj tak har service `.toLowerCase()` karke save karti thi, isliye
 *    DB me "davangere", "basmati rice" pada hai. Naya code proper case
 *    likhta hai — ye script purane rows ko usi standard pe le aati hai,
 *    warna list me aadha "Davangere" aur aadha "davangere" dikhta.
 *
 * ⚠️ Original casing WAPAS NAHI aa sakti (wo kho chuki hai). Ye wahi rules
 *    lagati hai jo naya code lagata hai — `utils/textCase.js`.
 *
 * ✅ IDEMPOTENT — dobara chalao to "0 changes" aana chahiye.
 * ✅ Kuch DELETE nahi hota. Duplicate addresses sirf `isDeleted: true`
 *    hote hain (reversible).
 * 🔒 `email`, `role`, `loginType`, `product.type`, `zipcode`, `SKU` —
 *    inhe haath nahi lagta (wo identity/enum hain, display nahi).
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { toTitleCase, toSentenceCase } = require("../utils/textCase");
const { buildFormattedAddress } = require("../helpers/locations");

const APPLY = process.argv.includes("--apply");
const UNDO_FILE = (process.argv.find((a) => a.startsWith("--undo=")) || "").split("=")[1];
const NO_DEDUPE = process.argv.includes("--no-dedupe");
const NO_ORDERS = process.argv.includes("--no-orders");
const REBUILD_FORMATTED = process.argv.includes("--rebuild-formatted");
const YES_PROD = process.argv.includes("--yes-prod");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1];

const SAMPLES = 4;
const BATCH = 500;

const P = (...a) => console.log(...a);
const hr = (t) => P(`\n${"═".repeat(74)}\n  ${t}\n${"═".repeat(74)}`);

/**
 * 🔙 UNDO LOG — `--apply` ke waqt har change ka PURANA value yahan jama
 *    hota hai, aur ek JSON file me likh diya jata hai. Usse exactly wahi
 *    changes wapas ho sakte hain, poora DB restore kiye bina:
 *      node scripts/backfillTextCase.js --undo=scripts/.backfill-undo-XXX.json
 */
const undoLog = [];
const recordUndo = (coll, id, set) => undoLog.push({ coll, id: String(id), set });

/**
 * Kaun se field kis rule se. Jo yahan nahi hai use chhua bhi nahi jayega.
 */
const TARGETS = [
  {
    coll: "locations",
    title: ["name", "shopOrBuildingNumber", "address", "area", "city",
            "district", "state", "country", "formattedAddress"],
    sentence: [],
  },
  { coll: "users", title: ["name"], sentence: [] },
  { coll: "categories", title: ["name"], sentence: ["description"] },
  { coll: "subcategories", title: ["name"], sentence: ["description"] },
  { coll: "products", title: ["name", "brand"], sentence: ["description"] },
  { coll: "banners", title: ["name"], sentence: ["description"] },
  { coll: "term&conditions", title: ["title"], sentence: ["description"] },
  { coll: "privacy&policies", title: ["title"], sentence: ["description"] },
  {
    coll: "vendorserviceareas",
    title: ["city", "district", "state", "country"],
    sentence: [],
  },
  { coll: "vendorprofiles", title: ["shopName", "legalName"], sentence: [] },
];

/** Ek doc ke liye `$set` banao — sirf wo fields jo ACTUALLY badal rahe hain */
const planDoc = (doc, spec) => {
  const set = {};
  for (const f of spec.title) {
    const cur = doc[f];
    if (typeof cur !== "string" || !cur) continue;
    const next = toTitleCase(cur);
    if (next !== cur) set[f] = next;
  }
  for (const f of spec.sentence) {
    const cur = doc[f];
    if (typeof cur !== "string" || !cur) continue;
    const next = toSentenceCase(cur);
    if (next !== cur) set[f] = next;
  }
  return set;
};

const fmt = (n) => String(n).padStart(6);

// ─────────────────────────────────────────── PART A: flat collections
const backfillCollection = async (db, spec, existing) => {
  const real = existing.find((c) => c.toLowerCase() === spec.coll.toLowerCase());
  if (!real) {
    P(`  ${spec.coll.padEnd(22)} ${"—".padStart(6)}   collection nahi mili`);
    return { scanned: 0, changed: 0, fields: 0 };
  }
  const c = db.collection(real);
  const cursor = c.find({}, { projection: Object.fromEntries(
    [...spec.title, ...spec.sentence].map((f) => [f, 1]),
  ) });

  let scanned = 0;
  let changed = 0;
  let fields = 0;
  const samples = [];
  let ops = [];

  for await (const doc of cursor) {
    scanned++;
    const set = planDoc(doc, spec);
    const keys = Object.keys(set);
    if (!keys.length) continue;
    changed++;
    fields += keys.length;
    if (samples.length < SAMPLES) {
      const k = keys[0];
      samples.push(`${k}: ${JSON.stringify(doc[k])} → ${JSON.stringify(set[k])}`);
    }
    if (APPLY) {
      recordUndo(real, doc._id, Object.fromEntries(keys.map((k) => [k, doc[k]])));
    }
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
    if (APPLY && ops.length >= BATCH) {
      await c.bulkWrite(ops, { ordered: false });
      ops = [];
    }
  }
  if (APPLY && ops.length) await c.bulkWrite(ops, { ordered: false });

  const flag = changed ? (APPLY ? "✏️ " : "🔎") : "✅";
  P(`  ${flag} ${real.padEnd(20)} ${fmt(changed)} / ${String(scanned).padEnd(6)} docs   (${fields} fields)`);
  samples.forEach((s) => P(`        ${s}`));
  return { scanned, changed, fields };
};

// ───────────── PART A2: locations.formattedAddress dobara banao
/**
 * Casing backfill sirf casing theek karta hai, DHAANCHA nahi. Purane
 * `formattedAddress` purane template-string se bane the:
 *
 *   "Davangere , Davangere , Davangere , Karanataka, 577001, India"
 *        ↑ space-before-comma    ↑ city/district/address teeno same
 *
 * Naya code `buildFormattedAddress()` se banata hai — khali parts skip,
 * lagatar duplicate ek baar. Ye step purane rows ko usi shakl me laata hai,
 * warna list me aadha saaf aur aadha ganda dikhta rahega.
 */
const rebuildFormatted = async (db) => {
  const c = db.collection("locations");
  const cursor = c.find(
    {},
    { projection: { address: 1, city: 1, district: 1, state: 1, zipcode: 1, country: 1, formattedAddress: 1 } },
  );
  let scanned = 0;
  let changed = 0;
  const samples = [];
  let ops = [];

  for await (const doc of cursor) {
    scanned++;
    const next = buildFormattedAddress(doc);
    if (!next || next === doc.formattedAddress) continue;
    changed++;
    if (samples.length < SAMPLES) {
      samples.push(`${JSON.stringify(doc.formattedAddress)}\n            → ${JSON.stringify(next)}`);
    }
    if (APPLY) recordUndo("locations", doc._id, { formattedAddress: doc.formattedAddress });
    ops.push({
      updateOne: { filter: { _id: doc._id }, update: { $set: { formattedAddress: next } } },
    });
    if (APPLY && ops.length >= BATCH) {
      await c.bulkWrite(ops, { ordered: false });
      ops = [];
    }
  }
  if (APPLY && ops.length) await c.bulkWrite(ops, { ordered: false });

  const flag = changed ? (APPLY ? "✏️ " : "🔎") : "✅";
  P(`  ${flag} ${"formattedAddress".padEnd(20)} ${fmt(changed)} / ${String(scanned).padEnd(6)} docs`);
  samples.forEach((s) => P(`        ${s}`));
  return { scanned: 0, changed, fields: changed };
};

// ─────────────────────── PART B: orders[].items[].productSnapshot
const backfillOrderSnapshots = async (db) => {
  const c = db.collection("orders");
  const cursor = c.find(
    { "items.productSnapshot": { $exists: true } },
    { projection: { "items.productSnapshot.name": 1, "items.productSnapshot.brand": 1 } },
  );
  let scanned = 0;
  let changed = 0;
  let fields = 0;
  const samples = [];
  let ops = [];

  for await (const doc of cursor) {
    scanned++;
    const set = {};
    (doc.items || []).forEach((item, i) => {
      const snap = item?.productSnapshot;
      if (!snap) return;
      for (const f of ["name", "brand"]) {
        const cur = snap[f];
        if (typeof cur !== "string" || !cur) continue;
        const next = toTitleCase(cur);
        if (next !== cur) {
          set[`items.${i}.productSnapshot.${f}`] = next;
          if (samples.length < SAMPLES) {
            samples.push(`${f}: ${JSON.stringify(cur)} → ${JSON.stringify(next)}`);
          }
        }
      }
    });
    const keys = Object.keys(set);
    if (!keys.length) continue;
    changed++;
    fields += keys.length;
    if (APPLY) {
      // dotted path se purana value nikaalo: items.<i>.productSnapshot.<f>
      const prev = {};
      for (const k of keys) {
        const [, i, , f] = k.split(".");
        prev[k] = doc.items[Number(i)].productSnapshot[f];
      }
      recordUndo("orders", doc._id, prev);
    }
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
    if (APPLY && ops.length >= BATCH) {
      await c.bulkWrite(ops, { ordered: false });
      ops = [];
    }
  }
  if (APPLY && ops.length) await c.bulkWrite(ops, { ordered: false });

  const flag = changed ? (APPLY ? "✏️ " : "🔎") : "✅";
  P(`  ${flag} ${"orders (snapshots)".padEnd(20)} ${fmt(changed)} / ${String(scanned).padEnd(6)} docs   (${fields} fields)`);
  samples.forEach((s) => P(`        ${s}`));
  return { scanned, changed, fields };
};

// ─────────────────────────────── PART C: duplicate address dedupe
const dedupeAddresses = async (db) => {
  const Loc = db.collection("locations");
  const Usr = db.collection("users");

  const groups = await Loc.aggregate([
    { $match: { isDeleted: false, type: "CUSTOMER" } },
    {
      $group: {
        _id: {
          u: "$userId",
          z: { $ifNull: ["$zipcode", ""] },
          a: { $toLower: { $trim: { input: { $ifNull: ["$address", ""] } } } },
        },
        n: { $sum: 1 },
        docs: {
          $push: {
            id: "$_id",
            isDefault: "$isDefault",
            createdAt: "$createdAt",
            address: "$address",
          },
        },
      },
    },
    { $match: { n: { $gt: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();

  if (!groups.length) {
    P("  ✅ koi duplicate address nahi mila");
    return { groups: 0, removed: 0 };
  }

  // `user.locationId` jis doc pe point karta hai use kabhi delete mat karo
  const userIds = [...new Set(groups.map((g) => String(g._id.u)))];
  const pinned = new Set(
    (
      await Usr.find(
        { _id: { $in: userIds.map((u) => new mongoose.Types.ObjectId(u)) } },
        { projection: { locationId: 1 } },
      ).toArray()
    )
      .map((u) => u.locationId && String(u.locationId))
      .filter(Boolean),
  );

  const toRemove = [];
  for (const g of groups) {
    const docs = [...g.docs].sort(
      (a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0),
    );
    // Rakhne ka order: default > user.locationId wala > sabse purana
    const keep =
      docs.find((d) => d.isDefault === true) ||
      docs.find((d) => pinned.has(String(d.id))) ||
      docs[0];

    const drop = docs.filter((d) => String(d.id) !== String(keep.id));
    P(
      `  user=${g._id.u}  zip=${g._id.z}  x${g.n} → 1 rakha, ${drop.length} soft-delete` +
        `  "${String(g._id.a).slice(0, 38)}"`,
    );
    P(
      `      keep ${keep.id}${keep.isDefault ? " ⭐default" : ""}${
        pinned.has(String(keep.id)) ? " ←user.locationId" : ""
      }`,
    );
    for (const d of drop) {
      if (pinned.has(String(d.id))) {
        P(`      ⚠️  SKIP ${d.id} — user.locationId isi pe hai`);
        continue;
      }
      toRemove.push(d.id);
    }
  }

  if (APPLY && toRemove.length) {
    // Undo ke liye purane flags pehle padh lo
    const before = await Loc.find(
      { _id: { $in: toRemove } },
      { projection: { isDeleted: 1, isActive: 1 } },
    ).toArray();
    before.forEach((d) =>
      recordUndo("locations", d._id, {
        isDeleted: d.isDeleted ?? false,
        isActive: d.isActive ?? true,
      }),
    );
    const res = await Loc.updateMany(
      { _id: { $in: toRemove } },
      { $set: { isDeleted: true, isActive: false } },
    );
    P(`\n  ✏️  ${res.modifiedCount} docs soft-delete hue (isDeleted: true)`);
  }
  return { groups: groups.length, removed: toRemove.length };
};

// ─────────────────────────────────────────── UNDO mode
const runUndo = async (db, file) => {
  const entries = JSON.parse(fs.readFileSync(file, "utf8")).entries;
  hr(`UNDO — ${entries.length} changes wapas kiye ja rahe hain`);
  const byColl = new Map();
  for (const e of entries) {
    if (!byColl.has(e.coll)) byColl.set(e.coll, []);
    byColl.get(e.coll).push({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(e.id) },
        update: { $set: e.set },
      },
    });
  }
  let total = 0;
  for (const [coll, ops] of byColl) {
    const res = await db.collection(coll).bulkWrite(ops, { ordered: false });
    total += res.modifiedCount;
    P(`  ↩️  ${coll.padEnd(22)} ${res.modifiedCount} docs wapas`);
  }
  P(`\n  ✅ ${total} docs restore ho gaye.\n`);
};

// ─────────────────────────────────────────────────────── main
(async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;
  const dbName = mongoose.connection.name;
  const isProd = /prod/i.test(dbName);

  if (UNDO_FILE) {
    P(`\n🔙 UNDO MODE   DB: ${dbName}   file: ${UNDO_FILE}`);
    await runUndo(db, UNDO_FILE);
    await mongoose.disconnect();
    return;
  }

  P(`\n${"█".repeat(74)}`);
  P(`  TEXT CASE BACKFILL     DB: ${dbName}`);
  P(`  MODE: ${APPLY ? "⚠️  APPLY — asli writes honge" : "🔎 DRY RUN — kuch nahi likha jayega"}`);
  if (isProd) P(`  🔴 PRODUCTION DATABASE`);
  P(`${"█".repeat(74)}`);

  if (isProd && APPLY && !YES_PROD) {
    P(`\n❌ ABORT: prod pe --apply ke liye --yes-prod bhi chahiye.`);
    P(`   Pehle mongodump lo, phir:`);
    P(`   node scripts/backfillTextCase.js --apply --yes-prod\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const existing = (await db.listCollections().toArray()).map((c) => c.name);
  const total = { scanned: 0, changed: 0, fields: 0 };

  hr("PART A — casing backfill");
  P(`  ${"collection".padEnd(23)} ${"badlenge".padStart(6)} / total\n`);
  for (const spec of TARGETS) {
    if (ONLY && spec.coll !== ONLY) continue;
    const r = await backfillCollection(db, spec, existing);
    total.scanned += r.scanned;
    total.changed += r.changed;
    total.fields += r.fields;
  }

  if (REBUILD_FORMATTED && (!ONLY || ONLY === "locations")) {
    P("");
    const r = await rebuildFormatted(db);
    total.changed += r.changed;
    total.fields += r.fields;
  }

  if (!NO_ORDERS && (!ONLY || ONLY === "orders")) {
    P("");
    const r = await backfillOrderSnapshots(db);
    total.scanned += r.scanned;
    total.changed += r.changed;
    total.fields += r.fields;
  }

  let dedupe = { groups: 0, removed: 0 };
  if (!NO_DEDUPE && !ONLY) {
    hr("PART B — duplicate addresses (soft-delete, reversible)");
    dedupe = await dedupeAddresses(db);
  }

  hr("SUMMARY");
  P(`  casing   : ${total.changed} docs badlenge (${total.fields} fields), ${total.scanned} scan hue`);
  P(`  dedupe   : ${dedupe.groups} groups, ${dedupe.removed} docs soft-delete honge`);
  P("");
  if (APPLY) {
    const file = path.join(
      __dirname,
      `.backfill-undo-${dbName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    fs.writeFileSync(
      file,
      JSON.stringify({ db: dbName, at: new Date().toISOString(), entries: undoLog }, null, 1),
    );
    P(`  🔙 UNDO FILE: ${path.relative(process.cwd(), file)}  (${undoLog.length} entries)`);
    P(`     Sab wapas karna ho to:`);
    P(`     node scripts/backfillTextCase.js --undo=${path.relative(process.cwd(), file)}`);
    P("");
    P('  ✅ APPLY ho gaya. Ab dobara DRY RUN chalao — "0 changes" aana chahiye:');
    P("     node scripts/backfillTextCase.js");
  } else {
    P("  🔎 DRY RUN tha — DB me kuch nahi badla.");
    P("     Theek lage to: node scripts/backfillTextCase.js --apply");
  }
  P("");

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error("\n❌", e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
