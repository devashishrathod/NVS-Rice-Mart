/* eslint-disable no-console */
/**
 * STAGE TEST LOGINS — migrated DB pe frontend ke liye known passwords.
 *
 *   MONGO_URL="<stage>" node scripts/seedStageAccounts.js
 *   MONGO_URL="<stage>" node scripts/seedStageAccounts.js --apply
 *
 * Naye users NAHI banata — MAUJOOD users ka password reset karta hai, taaki
 * data shape prod jaisa hi rahe (koi extra test doc nahi).
 *
 * 3 customers teeno app states cover karte hain:
 *   1. serviceable pincode  → catalog dikhega
 *   2. bahar ka pincode     → 404 PINCODE_NOT_SERVICEABLE
 *   3. koi address nahi     → 400 PINCODE_REQUIRED
 *
 * 🔒 PROD DB pe chalne se mana karta hai.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../models/User");
const Location = require("../models/Location");
const VendorServiceArea = require("../models/VendorServiceArea");
const { ROLES, LOCATION_TYPES } = require("../constants");

const APPLY = process.argv.includes("--apply");
const ADMIN_PW = "Admin@123";
const CUST_PW = "Stage@123";
const VENDOR_PW = "nagraj@123";

const log = (s = "") => console.log(s);
const hr = (t) => log(`\n${"═".repeat(76)}\n  ${t}\n${"═".repeat(76)}`);

const setPassword = async (user, plain) => {
  user.password = plain; // pre-save hook bcrypt karega
  await user.save();
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const dbName = mongoose.connection.name;
  if (/prod/i.test(dbName)) {
    throw new Error(`ABORT: ye PRODUCTION DB hai (${dbName}).`);
  }
  log(`\n${APPLY ? "🔴 APPLY MODE" : "🔍 DRY RUN"}   DB: ${dbName}\n`);

  const serviceZips = (
    await VendorServiceArea.find({ isDeleted: false }).select("zipcode").lean()
  ).map((a) => a.zipcode);
  log(`   service pincodes: ${serviceZips.join(", ") || "(koi nahi — migration chalayi?)"}`);

  const rows = [];

  // ── Admin ──────────────────────────────────────────────────
  hr("1. Admin");
  const admin = await User.findOne({ role: ROLES.ADMIN, isDeleted: false });
  if (!admin) log("   ❌ koi admin nahi mila");
  else {
    log(`   ${admin.email || admin.mobile}  →  password reset`);
    if (APPLY) await setPassword(admin, ADMIN_PW);
    rows.push(["admin", admin.email || admin.mobile, ADMIN_PW, "admin panel"]);
  }

  // ── Vendor ─────────────────────────────────────────────────
  hr("2. Vendor");
  const vendor = await User.findOne({ role: ROLES.VENDOR, isDeleted: false });
  if (!vendor) log("   ❌ koi vendor nahi mila — migration chalayi?");
  else {
    log(`   ${vendor.email || vendor.mobile}  →  password confirm`);
    if (APPLY) await setPassword(vendor, VENDOR_PW);
    rows.push(["vendor", vendor.email || vendor.mobile, VENDOR_PW, "vendor panel"]);
  }

  // ── Customer 1 — serviceable ───────────────────────────────
  hr("3. Customer — serviceable pincode");
  const inLoc = await Location.findOne({
    type: LOCATION_TYPES.CUSTOMER,
    isDeleted: false,
    isDefault: true,
    zipcode: { $in: serviceZips },
  }).lean();
  const inUser = inLoc && (await User.findById(inLoc.userId));
  if (!inUser) log("   ❌ nahi mila");
  else {
    log(`   ${inUser.email || inUser.mobile}  (pincode ${inLoc.zipcode})`);
    if (APPLY) await setPassword(inUser, CUST_PW);
    rows.push([
      "customer (in-area)",
      inUser.email || inUser.mobile,
      CUST_PW,
      `${inLoc.zipcode} → catalog dikhega`,
    ]);
  }

  // ── Customer 2 — bahar ─────────────────────────────────────
  hr("4. Customer — service area ke bahar");
  const outLoc = await Location.findOne({
    type: LOCATION_TYPES.CUSTOMER,
    isDeleted: false,
    isDefault: true,
    zipcode: { $nin: serviceZips },
  }).lean();
  const outUser = outLoc && (await User.findById(outLoc.userId));
  if (!outUser) log("   ⚠️  nahi mila (sab customers service area me hain)");
  else {
    log(`   ${outUser.email || outUser.mobile}  (pincode ${outLoc.zipcode})`);
    if (APPLY) await setPassword(outUser, CUST_PW);
    rows.push([
      "customer (out-of-area)",
      outUser.email || outUser.mobile,
      CUST_PW,
      `${outLoc.zipcode} → 404 PINCODE_NOT_SERVICEABLE`,
    ]);
  }

  // ── Customer 3 — bina address ──────────────────────────────
  hr("5. Customer — koi address nahi");
  const noAddr = await User.aggregate([
    { $match: { role: ROLES.USER, isDeleted: false, mobile: { $ne: null } } },
    { $lookup: { from: "locations", localField: "_id", foreignField: "userId", as: "l" } },
    { $match: { l: { $size: 0 } } },
    { $limit: 1 },
  ]);
  const newUser = noAddr.length && (await User.findById(noAddr[0]._id));
  if (!newUser) log("   ⚠️  nahi mila");
  else {
    log(`   ${newUser.email || newUser.mobile}  (koi address nahi)`);
    if (APPLY) await setPassword(newUser, CUST_PW);
    rows.push([
      "customer (no address)",
      newUser.email || newUser.mobile,
      CUST_PW,
      "400 PINCODE_REQUIRED → onboarding",
    ]);
  }

  // ── Credentials ────────────────────────────────────────────
  hr(APPLY ? "✅ STAGE TEST LOGINS" : "🔍 DRY RUN — inke password set hote");
  const w = [24, 26, 12];
  log(
    `   ${"role".padEnd(w[0])} ${"login".padEnd(w[1])} ${"password".padEnd(w[2])} kya test hoga`,
  );
  log(`   ${"-".repeat(w[0])} ${"-".repeat(w[1])} ${"-".repeat(w[2])} ${"-".repeat(34)}`);
  rows.forEach(([r, l, p, n]) =>
    log(`   ${r.padEnd(w[0])} ${String(l).padEnd(w[1])} ${p.padEnd(w[2])} ${n}`),
  );

  log(`\n   Login: POST /auth/login`);
  log(`     email wale  → { "type": "email",  "email": "...",  "password": "...", "role": "..." }`);
  log(`     mobile wale → { "type": "mobile", "mobile": "...", "password": "...", "role": "..." }`);

  if (!APPLY) log("\n🔍 DRY RUN complete — set karne ke liye `--apply`\n");
  else log("\n✅ passwords set ho gaye\n");

  await mongoose.disconnect();
};

run().catch(async (e) => {
  console.error("\n❌", e.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
