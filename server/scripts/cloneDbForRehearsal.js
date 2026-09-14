/* eslint-disable no-console */
/**
 * REHEARSAL DB BANAO — prod ka clone, migration ki asli practice ke liye.
 *
 *   node scripts/cloneDbForRehearsal.js --from NvsRiceMart-ProdDB --to NvsRiceMart-Rehearsal
 *   node scripts/cloneDbForRehearsal.js --from NvsRiceMart-ProdDB --to NvsRiceMart-Rehearsal --apply
 *
 * - SOURCE se sirf PADHTA hai. Ek bhi write nahi.
 * - TARGET naya DB hai usi cluster pe (MONGO_URL se host/credentials leta hai).
 * - Indexes bhi copy karta hai — taaki rehearsal bilkul prod jaisa ho
 *   (wo bekaar `location_2dsphere` bhi, jise migration drop karegi).
 * - `--apply` ke bina kuch nahi likhta.
 *
 * 🔒 TARGET ka naam "prod" ho to refuse karta hai.
 */
require("dotenv").config();
const { MongoClient } = require("mongoose/node_modules/mongodb");

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const FROM = arg("--from");
const TO = arg("--to");
const APPLY = process.argv.includes("--apply");

const log = (s = "") => console.log(s);
const hr = (t) => log(`\n${"═".repeat(74)}\n  ${t}\n${"═".repeat(74)}`);

const run = async () => {
  if (!FROM || !TO) {
    throw new Error(
      "Usage: node scripts/cloneDbForRehearsal.js --from <sourceDb> --to <targetDb> [--apply]",
    );
  }
  if (/prod/i.test(TO)) {
    throw new Error(`ABORT: target "${TO}" me "prod" hai. Kabhi prod pe mat likho.`);
  }
  if (FROM === TO) throw new Error("ABORT: source aur target same hain");

  // MONGO_URL se cluster/credentials, DB naam replace kar denge
  const base = process.env.MONGO_URL;
  if (!base) throw new Error("ABORT: MONGO_URL set nahi hai");
  const urlFor = (db) => {
    const u = new URL(base);
    u.pathname = `/${db}`;
    return u.toString();
  };

  const client = new MongoClient(urlFor(FROM), { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  const src = client.db(FROM);
  const dst = client.db(TO);

  log(`\n${APPLY ? "🔴 APPLY MODE" : "🔍 DRY RUN"}`);
  log(`   SOURCE (read-only) : ${FROM}`);
  log(`   TARGET             : ${TO}\n`);

  const cols = (await src.listCollections().toArray()).map((c) => c.name).sort();

  // ── Target already kuch hai? ───────────────────────────────
  const existing = (await dst.listCollections().toArray()).map((c) => c.name);
  if (existing.length) {
    hr("⚠️  TARGET khali nahi hai");
    for (const n of existing) {
      log(`   ${n.padEnd(24)} ${await dst.collection(n).countDocuments()} docs`);
    }
    log(`\n   ${APPLY ? "Ye sab DROP honge" : "Ye sab DROP hote"} — rehearsal fresh honi chahiye`);
  }

  hr("Copy plan");
  let total = 0;
  const counts = {};
  for (const name of cols) {
    counts[name] = await src.collection(name).countDocuments();
    total += counts[name];
    const idx = await src.collection(name).indexes();
    log(
      `   ${name.padEnd(24)} ${String(counts[name]).padStart(6)} docs  ${idx.length} index(es)`,
    );
  }
  log(`   ${"—".repeat(24)} ${String(total).padStart(6)} docs total`);

  if (!APPLY) {
    log("\n🔍 DRY RUN complete — copy karne ke liye `--apply` lagao\n");
    await client.close();
    return;
  }

  // ── Drop + copy ────────────────────────────────────────────
  hr("Copying");
  for (const name of existing) {
    await dst.collection(name).drop().catch(() => {});
  }

  for (const name of cols) {
    const docs = await src.collection(name).find({}).toArray();
    if (docs.length) {
      // ordered:false — ek doc fail ho to baaki rukein na
      await dst.collection(name).insertMany(docs, { ordered: false });
    } else {
      await dst.createCollection(name).catch(() => {});
    }

    // indexes (_id_ apne aap banta hai)
    const idx = await src.collection(name).indexes();
    let idxMade = 0;
    for (const i of idx) {
      if (i.name === "_id_") continue;
      const { key, name: iname, v, ns, ...opts } = i;
      try {
        await dst.collection(name).createIndex(key, { ...opts, name: iname });
        idxMade++;
      } catch (e) {
        log(`      ⚠️  index ${iname} skip: ${e.message.split("\n")[0]}`);
      }
    }
    const got = await dst.collection(name).countDocuments();
    const okMark = got === counts[name] ? "✅" : "❌";
    log(`   ${okMark} ${name.padEnd(24)} ${String(got).padStart(6)}/${counts[name]} docs, ${idxMade} index(es)`);
  }

  // ── Verify ─────────────────────────────────────────────────
  hr("VERIFY");
  let bad = 0;
  for (const name of cols) {
    const got = await dst.collection(name).countDocuments();
    if (got !== counts[name]) {
      bad++;
      log(`   ❌ ${name}: ${got} vs ${counts[name]}`);
    }
  }
  log(bad ? `   ⚠️  ${bad} collection mismatch` : "   ✅ saare counts match");

  log(`\n✅ Rehearsal DB ready: ${TO}`);
  log(`\n   Ab isko use karne ke liye (apni .env chhue bina):`);
  log(`     MONGO_URL="${urlFor(TO).replace(/:[^:@/]+@/, ":•••@")}" node scripts/migrateToVendorModel.js\n`);

  await client.close();
};

run().catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
