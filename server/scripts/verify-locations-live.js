/* eslint-disable no-console */
/**
 * `PUT /locations/upsert` ka LIVE verification.
 *
 * ⚠️ Ye DB se connect hota hai, par **sirf apna banaya hua scratch data**
 *    chhuta hai — script khud temp users banati hai aur `finally` me unhe
 *    (aur unke saare locations ko) delete kar deti hai. Kisi maujooda user,
 *    address ya order ko haath nahi lagta.
 *
 * Transactions/invariants static test se verify nahi hote, isliye ye zaroori
 * hai. Chalane ka tarika:
 *   MONGO_URL="<stage-uri>" node scripts/verify-upsert-live.js
 */
const mongoose = require("mongoose");
const User = require("../models/User");
const Location = require("../models/Location");
const {
  upsertLocation,
  getAllLocations,
  updateLocation,
} = require("../services/locations");
const { ROLES, LOCATION_TYPES } = require("../constants");

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
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 58 - t.length))}`);

const STAMP = `upsert-test-${Date.now()}`;
const tempUserIds = [];

const ADDR = {
  address: "12c vittal mandir road",
  area: "maharaja pet",
  city: "davangere",
  district: "davangere",
  state: "karnataka",
  zipcode: "577004",
  coordinates: [14.4641, 75.9217],
};

const makeUser = async (role = ROLES.USER, extra = {}) => {
  const u = await User.create({
    name: `${STAMP}`,
    email: `${STAMP}-${tempUserIds.length}@example.com`,
    password: "x".repeat(20),
    role,
    ...extra,
  });
  tempUserIds.push(u._id);
  return u;
};

const actorOf = (u) => ({ userId: u._id, role: u.role });

const caught = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
};

const countLive = (userId) =>
  Location.countDocuments({
    userId,
    type: LOCATION_TYPES.CUSTOMER,
    isDeleted: false,
  });

(async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log(`\n📦 DB: ${mongoose.connection.db.databaseName}`);
  console.log(`🏷️  scratch marker: ${STAMP}\n`);

  try {
    // ═══════════════════════════════════════════════════════
    hr("1. Naya customer, koi address nahi → CREATE");
    const u1 = await makeUser();
    const r1 = await upsertLocation(actorOf(u1), { ...ADDR });
    ok("created: true", r1.created === true, JSON.stringify(r1.created));
    ok("promoted: false", r1.promoted === false);
    ok("isDefault: true", r1.location.isDefault === true);
    ok("type CUSTOMER", r1.location.type === LOCATION_TYPES.CUSTOMER);
    ok("exactly 1 address bana", (await countLive(u1._id)) === 1);
    ok(
      "formattedAddress me 'undefined' nahi",
      !String(r1.location.formattedAddress).includes("undefined"),
      r1.location.formattedAddress,
    );
    {
      const fresh = await User.findById(u1._id).select("locationId");
      ok(
        "user.locationId sync ho gaya",
        String(fresh.locationId) === String(r1.location._id),
      );
    }

    // ═══════════════════════════════════════════════════════
    hr("2. 🔴 Wahi user dobara upsert → UPDATE, duplicate NAHI");
    const r2 = await upsertLocation(actorOf(u1), {
      ...ADDR,
      address: "45 new layout road",
      name: "home",
    });
    ok("created: false", r2.created === false);
    ok(
      "wahi _id (naya doc nahi bana)",
      String(r2.location._id) === String(r1.location._id),
      `${r1.location._id} vs ${r2.location._id}`,
    );
    // NOTE: values proper-case me save hoti hain (Phase 4) — isliye
    // "45 new layout road" → "45 New Layout Road".
    ok("address update ho gaya", r2.location.address === "45 New Layout Road",
       r2.location.address);
    ok("name set ho gaya", r2.location.name === "Home", r2.location.name);
    ok("🔑 abhi bhi sirf 1 address", (await countLive(u1._id)) === 1);
    ok("isDefault: true bacha", r2.location.isDefault === true);
    ok(
      "formattedAddress recompute hua",
      r2.location.formattedAddress.startsWith("45 New Layout Road"),
      r2.location.formattedAddress,
    );

    hr("2b. 5 baar Save dabao (asli bug ka scenario) → phir bhi 1 address");
    for (let i = 0; i < 5; i++) {
      await upsertLocation(actorOf(u1), { ...ADDR, address: `spam ${i}` });
    }
    ok("🔑 5 upsert ke baad bhi 1 hi address", (await countLive(u1._id)) === 1,
       `count=${await countLive(u1._id)}`);

    // ═══════════════════════════════════════════════════════
    hr("3. Multiple address, ek default → sirf DEFAULT update ho");
    const u2 = await makeUser();
    const extra1 = await Location.create({
      userId: u2._id, type: LOCATION_TYPES.CUSTOMER, isDefault: false,
      isDeleted: false, address: "office address", city: "davangere",
      country: "india", state: "karnataka", zipcode: "577001", coordinates: [14.4, 75.9],
    });
    const theDefault = await Location.create({
      userId: u2._id, type: LOCATION_TYPES.CUSTOMER, isDefault: true,
      isDeleted: false, address: "home address", city: "davangere",
      country: "india", state: "karnataka", zipcode: "577002", coordinates: [14.4, 75.9],
    });
    const r3 = await upsertLocation(actorOf(u2), { ...ADDR, address: "updated home" });
    ok("created: false", r3.created === false);
    ok(
      "default wala hi update hua",
      String(r3.location._id) === String(theDefault._id),
    );
    ok("count 2 hi raha (naya nahi bana)", (await countLive(u2._id)) === 2);
    {
      const untouched = await Location.findById(extra1._id).lean();
      ok("non-default address chhua tak nahi", untouched.address === "office address");
      ok("non-default abhi bhi isDefault:false", untouched.isDefault === false);
      const defaults = await Location.countDocuments({
        userId: u2._id, type: LOCATION_TYPES.CUSTOMER, isDeleted: false, isDefault: true,
      });
      ok("🔑 single-default invariant kayam", defaults === 1, `defaults=${defaults}`);
    }

    // ═══════════════════════════════════════════════════════
    hr("4. Address hain par KOI default nahi → sabse purana promote ho");
    const u3 = await makeUser();
    const older = await Location.create({
      userId: u3._id, type: LOCATION_TYPES.CUSTOMER, isDefault: false,
      isDeleted: false, address: "older one", city: "davangere",
      country: "india", state: "karnataka", zipcode: "577001", coordinates: [14.4, 75.9],
      createdAt: new Date("2026-01-01"),
    });
    await Location.create({
      userId: u3._id, type: LOCATION_TYPES.CUSTOMER, isDefault: false,
      isDeleted: false, address: "newer one", city: "davangere",
      country: "india", state: "karnataka", zipcode: "577002", coordinates: [14.4, 75.9],
      createdAt: new Date("2026-06-01"),
    });
    const r4 = await upsertLocation(actorOf(u3), { ...ADDR, address: "promoted addr" });
    ok("created: false", r4.created === false);
    ok("promoted: true", r4.promoted === true);
    ok("sabse PURANA promote hua", String(r4.location._id) === String(older._id));
    ok("ab wo default hai", r4.location.isDefault === true);
    ok("naya doc nahi bana", (await countLive(u3._id)) === 2);
    {
      const defaults = await Location.countDocuments({
        userId: u3._id, type: LOCATION_TYPES.CUSTOMER, isDeleted: false, isDefault: true,
      });
      ok("🔑 exactly 1 default", defaults === 1, `defaults=${defaults}`);
    }

    // ═══════════════════════════════════════════════════════
    hr("5. 🔒 Customer doosre ka userId bheje → 403");
    const victim = await makeUser();
    const e5 = await caught(() =>
      upsertLocation(actorOf(u1), { ...ADDR, userId: String(victim._id) }),
    );
    ok("error aaya", !!e5);
    ok("statusCode 403", e5?.statusCode === 403, `got ${e5?.statusCode}`);
    ok("victim ka koi address nahi bana", (await countLive(victim._id)) === 0);

    hr("5b. 🔒 Apna hi userId bhejna allowed hai");
    const e5b = await caught(() =>
      upsertLocation(actorOf(u1), { ...ADDR, userId: String(u1._id) }),
    );
    ok("koi error nahi", !e5b, e5b?.message);

    // ═══════════════════════════════════════════════════════
    hr("6. 👑 Admin kisi aur ke liye upsert kare");
    const admin = await makeUser(ROLES.ADMIN);
    const r6 = await upsertLocation(actorOf(admin), {
      ...ADDR,
      userId: String(victim._id),
      address: "admin ne banaya",
    });
    ok("created: true", r6.created === true);
    ok("address VICTIM ke naam pe bana", String(r6.location.userId) === String(victim._id));
    ok("admin ke naam pe NAHI bana", (await countLive(admin._id)) === 0);
    ok("victim ke paas ab 1 address", (await countLive(victim._id)) === 1);

    // ═══════════════════════════════════════════════════════
    hr("7. 🛡️ Vendor ka user.locationId overwrite NAHI hona chahiye");
    const vendor = await makeUser(ROLES.VENDOR);
    const branch = await Location.create({
      userId: vendor._id, type: LOCATION_TYPES.VENDOR_BRANCH, isDefault: true,
      isDeleted: false, address: "shop branch", city: "davangere",
      country: "india", state: "karnataka", zipcode: "577001", coordinates: [14.4, 75.9],
    });
    await User.updateOne({ _id: vendor._id }, { $set: { locationId: branch._id } });

    const r7 = await upsertLocation(actorOf(vendor), { ...ADDR });
    ok("vendor ka CUSTOMER address ban gaya", r7.created === true);
    {
      const fresh = await User.findById(vendor._id).select("locationId");
      ok(
        "🔑 locationId abhi bhi BRANCH pe point karta hai",
        String(fresh.locationId) === String(branch._id),
        `got ${fresh.locationId}, expected ${branch._id}`,
      );
      const b = await Location.findById(branch._id).lean();
      ok("branch ka isDefault sahi-salamat", b.isDefault === true);
      ok("branch ka type nahi badla", b.type === LOCATION_TYPES.VENDOR_BRANCH);
    }

    // ═══════════════════════════════════════════════════════
    hr("8. Validation / edge cases");
    {
      const e = await caught(() =>
        upsertLocation(actorOf(u1), { ...ADDR, zipcode: "12" }),
      );
      ok("galat Indian PIN → 422", e?.statusCode === 422, `got ${e?.statusCode}`);
    }
    {
      const e = await caught(() =>
        upsertLocation(actorOf(u1), { ...ADDR, coordinates: [1] }),
      );
      ok("1 coordinate → 422", e?.statusCode === 422, `got ${e?.statusCode}`);
    }
    {
      const u = await makeUser();
      const r = await upsertLocation(actorOf(u), { ...ADDR, coordinates: [0, 0] });
      ok(
        "[0, 0] coordinates allowed (purana `!Number(x)` bug nahi)",
        r.created === true && r.location.coordinates[0] === 0,
      );
    }
    {
      const u = await makeUser();
      const payload = { ...ADDR };
      delete payload.district;
      delete payload.area;
      const r = await upsertLocation(actorOf(u), payload);
      ok("district + area ke bina bhi bana", r.created === true);
      ok(
        "formattedAddress me 'undefined' nahi",
        !String(r.location.formattedAddress).includes("undefined"),
        r.location.formattedAddress,
      );
    }
    {
      const e = await caught(() =>
        upsertLocation({ userId: new mongoose.Types.ObjectId(), role: ROLES.USER }, { ...ADDR }),
      );
      ok("gayab user → 404", e?.statusCode === 404, `got ${e?.statusCode}`);
    }
    {
      const u = await makeUser();
      const r = await upsertLocation(actorOf(u), { ...ADDR, country: undefined });
      ok('country default "India" laga', r.location.country === "India", r.location.country);
    }

    // ═══════════════════════════════════════════════════════
    //  Phase 4 — casing on write + case-insensitive filters
    // ═══════════════════════════════════════════════════════
    hr("9. ✍️  Write side — display fields ab PROPER CASE me save hote hain");
    const u9 = await makeUser();
    const r9 = await upsertLocation(actorOf(u9), {
      address: "12c vittal mandir road",
      area: "maharaja pet",
      city: "davangere",
      district: "davangere",
      state: "karnataka",
      country: "india",
      zipcode: "577004",
      name: "home",
      coordinates: [14.4641, 75.9217],
    });
    ok(`city   → "${r9.location.city}"`, r9.location.city === "Davangere");
    ok(`state  → "${r9.location.state}"`, r9.location.state === "Karnataka");
    ok(`country→ "${r9.location.country}"`, r9.location.country === "India");
    ok(`address→ "${r9.location.address}"`, r9.location.address === "12c Vittal Mandir Road");
    ok(`area   → "${r9.location.area}"`, r9.location.area === "Maharaja Pet");
    ok(`name   → "${r9.location.name}"`, r9.location.name === "Home");
    ok(
      `formattedAddress → "${r9.location.formattedAddress}"`,
      r9.location.formattedAddress ===
        "12c Vittal Mandir Road, Davangere, Karnataka, 577004, India",
      r9.location.formattedAddress,
    );
    ok("zipcode pe casing nahi lagi", r9.location.zipcode === "577004");

    hr("9b. ALL-CAPS aur abbreviation input");
    {
      const u = await makeUser();
      const r = await upsertLocation(actorOf(u), {
        ...ADDR, city: "INDORE", state: "mp", district: "ALIRAJPUR",
        zipcode: "452001", address: "SHOP 4 MAIN ROAD",
      });
      ok(`"INDORE" → "${r.location.city}"`, r.location.city === "Indore");
      ok(`🔑 "mp" → "${r.location.state}"`, r.location.state === "MP");
      ok(`"ALIRAJPUR" → "${r.location.district}"`, r.location.district === "Alirajpur");
      ok(`"SHOP 4 MAIN ROAD" → "${r.location.address}"`, r.location.address === "Shop 4 Main Road");
    }
    hr("9c. Mixed case input — user ne jo likha wahi bache");
    {
      const u = await makeUser();
      const r = await upsertLocation(actorOf(u), {
        ...ADDR, name: "NVS Rice Mart", address: "iPhone Store Road",
      });
      ok(`"NVS Rice Mart" bacha`, r.location.name === "NVS Rice Mart", r.location.name);
      ok(`"iPhone Store Road" bacha`, r.location.address === "iPhone Store Road", r.location.address);
    }

    hr("10. 🔍 Read side — filters CASE-INSENSITIVE");
    const asAdmin = { userId: admin._id, role: ROLES.ADMIN };
    const findCity = async (q) => {
      const res = await getAllLocations(
        { ...q, userId: String(u9._id), limit: 50 },
        asAdmin,
      ).catch(() => ({ data: [] }));
      return res.data.length;
    };
    ok("?city=Davangere  (exact)", (await findCity({ city: "Davangere" })) === 1);
    ok("?city=davangere  (lower)", (await findCity({ city: "davangere" })) === 1);
    ok("?city=DAVANGERE  (upper)", (await findCity({ city: "DAVANGERE" })) === 1);
    ok("?city=DaVaNgErE  (mixed)", (await findCity({ city: "DaVaNgErE" })) === 1);
    ok("?city=  davangere  (spaces)", (await findCity({ city: "  davangere  " })) === 1);
    ok("?city=bhopal → 0 (galat city match nahi)", (await findCity({ city: "bhopal" })) === 0);
    ok("?city=davan → 0 (partial match NAHI)", (await findCity({ city: "davan" })) === 0);
    ok("?state=KARNATAKA", (await findCity({ state: "KARNATAKA" })) === 1);
    ok("?country=INDIA", (await findCity({ country: "INDIA" })) === 1);
    ok("?district=Davangere", (await findCity({ district: "Davangere" })) === 1);
    ok("?zipcode=577004 (exact, index-friendly)", (await findCity({ zipcode: "577004" })) === 1);

    hr("10b. 🔒 Regex injection / ReDoS guard");
    {
      const t0 = Date.now();
      const n = await findCity({ city: "(a+)+$" });
      const ms = Date.now() - t0;
      ok(`"(a+)+$" literal treat hua → ${n} result, ${ms}ms`, n === 0 && ms < 5000);
      const res = await getAllLocations(
        { search: "(a+)+$", userId: String(u9._id), limit: 5 },
        asAdmin,
      ).catch(() => ({ data: [] }));
      ok("search me bhi escape hua", res.data.length === 0);
    }

    hr("11. ✏️  updateLocation — casing + formattedAddress refresh");
    {
      const updated = await updateLocation(
        r9.location._id,
        { city: "bhopal", state: "mp", zipcode: "462001" },
        actorOf(u9),
      );
      ok(`city → "${updated.city}"`, updated.city === "Bhopal");
      ok(`state → "${updated.state}"`, updated.state === "MP");
      // district update nahi kiya tha, isliye wo purana ("Davangere") hi
      // rehna chahiye — sirf badle hue parts refresh hone chahiye.
      ok(
        `🔑 formattedAddress refresh hua → "${updated.formattedAddress}"`,
        updated.formattedAddress.includes("Bhopal") &&
          updated.formattedAddress.includes("462001") &&
          updated.formattedAddress.includes("MP") &&
          !updated.formattedAddress.includes("577004") &&
          !updated.formattedAddress.includes("Karnataka"),
        updated.formattedAddress,
      );
    }
    {
      const u = await makeUser();
      const r = await upsertLocation(actorOf(u), { ...ADDR });
      const upd = await updateLocation(
        r.location._id, { coordinates: [0, 75.9] }, actorOf(u),
      );
      ok(
        "update me [0, x] coordinates allowed (purana `!Number(x)` bug gaya)",
        upd.coordinates[0] === 0 && upd.coordinates[1] === 75.9,
        JSON.stringify(upd.coordinates),
      );
    }
    {
      const u = await makeUser();
      const r = await upsertLocation(actorOf(u), { ...ADDR });
      const upd = await updateLocation(
        r.location._id,
        { formattedAddress: "My Own Custom Address", city: "mysore" },
        actorOf(u),
      );
      ok(
        "client ka formattedAddress override nahi hota",
        upd.formattedAddress === "My Own Custom Address",
        upd.formattedAddress,
      );
    }
  } finally {
    // ── CLEANUP — sirf apna scratch data ──────────────────
    const delLoc = await Location.deleteMany({ userId: { $in: tempUserIds } });
    const delUsr = await User.deleteMany({ _id: { $in: tempUserIds } });
    console.log(
      `\n🧹 cleanup: ${delUsr.deletedCount} temp users, ${delLoc.deletedCount} temp locations hatayi`,
    );
    const leftover = await User.countDocuments({ name: STAMP });
    console.log(`🧹 leftover scratch users: ${leftover}`);
    await mongoose.disconnect();
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log(`  PASS: ${pass}    FAIL: ${fail}`);
  console.log("=".repeat(64));
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error("\n❌ CRASH:", e);
  try {
    await Location.deleteMany({ userId: { $in: tempUserIds } });
    await User.deleteMany({ _id: { $in: tempUserIds } });
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
