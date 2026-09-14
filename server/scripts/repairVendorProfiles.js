/* eslint-disable no-console */
/**
 * ORPHAN VENDOR REPAIR
 *
 *   node scripts/repairVendorProfiles.js            # DRY RUN (default)
 *   node scripts/repairVendorProfiles.js --apply    # actually writes
 *
 * Problem ye hai: agar kisi ka `User(role: vendor)` hai par uska
 * `VendorProfile` nahi, to wo vendor poori tarah atka hua hai —
 *   • customer ko uska catalog kabhi nahi dikhega
 *   • GET /vendors/get/:id  → 404
 *   • PUT /vendors/me/delivery → 404
 *   • POST /vendors/create se theek bhi nahi kar sakte (email 409 dega)
 *
 * Ye script aise vendors ko dhoondh ke unka profile bana deti hai, standard
 * delivery defaults ke saath (isEnabled: false → charge ₹0).
 *
 * Branch (pickup point) bhi chahiye hota hai. Agar vendor ka koi
 * VENDOR_BRANCH location mila to usse link kar degi, warna clearly batayegi
 * ki admin ko branch add karna hai.
 *
 * IDEMPOTENT — dobara chalane pe kuch nahi bigdega.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../models/User");
const Location = require("../models/Location");
const VendorProfile = require("../models/VendorProfile");
const {
  ROLES,
  LOCATION_TYPES,
  VENDOR_STATUS,
  DEFAULT_VENDOR_DELIVERY,
} = require("../constants");

const APPLY = process.argv.includes("--apply");

const log = (s = "") => console.log(s);
const hr = (t) => log(`\n${"═".repeat(74)}\n  ${t}\n${"═".repeat(74)}`);

const shopNameFor = (user) =>
  user.name?.trim() ||
  user.email?.split("@")[0] ||
  `Vendor ${String(user._id).slice(-6)}`;

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  log(
    `\n${APPLY ? "🔴 APPLY MODE" : "🔍 DRY RUN"}   DB: ${mongoose.connection.name}\n`,
  );

  // ── 1. Orphan vendors dhoondo ──────────────────────────────
  hr("1. Orphan vendors (User role=vendor, par VendorProfile nahi)");

  const vendors = await User.find({ role: ROLES.VENDOR, isDeleted: false })
    .select("name email mobile createdAt locationId")
    .lean();
  const profiles = await VendorProfile.find({
    vendorId: { $in: vendors.map((v) => v._id) },
  })
    .select("vendorId defaultLocationId")
    .lean();
  const hasProfile = new Map(profiles.map((p) => [String(p.vendorId), p]));

  const orphans = vendors.filter((v) => !hasProfile.has(String(v._id)));

  log(`   total vendors      : ${vendors.length}`);
  log(`   profile hai        : ${vendors.length - orphans.length}`);
  log(`   profile NAHI hai   : ${orphans.length}`);

  if (!orphans.length) {
    log("\n   ✅ koi orphan vendor nahi — sab theek hai");
  } else {
    log("");
    for (const v of orphans) {
      log(
        `   • ${String(v._id)}  ${(v.email || v.mobile || "—").padEnd(30)} "${shopNameFor(v)}"`,
      );
    }
  }

  // ── 2. Har orphan ka plan ──────────────────────────────────
  const plan = [];
  if (orphans.length) {
    hr("2. Repair plan");
    for (const v of orphans) {
      // koi branch hai?
      const branches = await Location.find({
        userId: v._id,
        isDeleted: false,
        $or: [
          { type: LOCATION_TYPES.VENDOR_BRANCH },
          { isProductAddress: true },
        ],
      })
        .sort({ isDefault: -1, createdAt: 1 })
        .lean();

      const branch = branches[0] || null;
      const validCoords =
        branch &&
        Array.isArray(branch.coordinates) &&
        Number(branch.coordinates[0]) &&
        Number(branch.coordinates[1]);

      plan.push({ vendor: v, branch, validCoords, branchCount: branches.length });

      log(`\n   ${shopNameFor(v)}  (${v.email || v.mobile || v._id})`);
      log(`     VendorProfile        → CREATE (delivery defaults, isEnabled:false)`);
      if (!branch) {
        log(`     defaultLocationId    → ⚠️  koi branch NAHI — admin ko add karna padega`);
        log(`        POST /vendors/${v._id}/branches`);
      } else if (!validCoords) {
        log(`     defaultLocationId    → ⚠️  branch mila (${branch.zipcode}) par coordinates invalid`);
      } else {
        log(`     defaultLocationId    → ${branch._id} (${branch.zipcode}) ✅`);
        if (branch.type !== LOCATION_TYPES.VENDOR_BRANCH) {
          log(`     branch.type          → "${branch.type ?? "undefined"}" se VENDOR_BRANCH`);
        }
      }
    }
  }

  // ── 3. Profile hai par branch toota hua? ───────────────────
  hr("3. Profile hai par pickup branch toota hua");
  const broken = [];
  for (const p of profiles) {
    if (!p.defaultLocationId) {
      broken.push({ p, reason: "defaultLocationId set hi nahi" });
      continue;
    }
    const loc = await Location.findOne({
      _id: p.defaultLocationId,
      isDeleted: false,
    })
      .select("coordinates zipcode userId")
      .lean();
    if (!loc) broken.push({ p, reason: "defaultLocationId ki Location nahi mili" });
    else if (String(loc.userId) !== String(p.vendorId)) {
      broken.push({ p, reason: "branch kisi aur vendor ka hai" });
    } else if (
      !Array.isArray(loc.coordinates) ||
      !Number(loc.coordinates[0]) ||
      !Number(loc.coordinates[1])
    ) {
      broken.push({ p, reason: `coordinates invalid (${JSON.stringify(loc.coordinates)})` });
    }
  }
  if (!broken.length) log("   ✅ sabke pickup branch theek hain");
  else {
    log(`   ⚠️  ${broken.length} vendor ka pickup branch problem me hai —`);
    log("      inke orders 503 VENDOR_PICKUP_MISSING denge:");
    broken.forEach((b) =>
      log(`      • vendorId ${String(b.p.vendorId)} — ${b.reason}`),
    );
    log("      Fix: PUT /vendors/:id/branches/:locationId/default (admin)");
  }

  // ── 4. Write ───────────────────────────────────────────────
  if (plan.length) {
    hr("4. " + (APPLY ? "Creating profiles" : "Jo create hota (dry run)"));
    for (const item of plan) {
      const { vendor: v, branch, validCoords } = item;
      log(`   ${APPLY ? "CREATE" : "would"}  VendorProfile  ${shopNameFor(v)}`);
      if (!APPLY) continue;

      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const defaultLocationId = validCoords ? branch._id : undefined;

        if (branch && branch.type !== LOCATION_TYPES.VENDOR_BRANCH) {
          await Location.updateOne(
            { _id: branch._id },
            { $set: { type: LOCATION_TYPES.VENDOR_BRANCH } },
            { session },
          );
        }
        if (validCoords) {
          // single-default invariant
          await Location.updateMany(
            {
              userId: v._id,
              type: LOCATION_TYPES.VENDOR_BRANCH,
              isDeleted: false,
            },
            { $set: { isDefault: false } },
            { session },
          );
          await Location.updateOne(
            { _id: branch._id },
            { $set: { isDefault: true } },
            { session },
          );
          await User.updateOne(
            { _id: v._id },
            { $set: { locationId: branch._id } },
            { session },
          );
        }

        await VendorProfile.create(
          [
            {
              vendorId: v._id,
              shopName: shopNameFor(v),
              defaultLocationId,
              delivery: { ...DEFAULT_VENDOR_DELIVERY },
              commissionPercent: 0,
              status: VENDOR_STATUS.APPROVED,
            },
          ],
          { session },
        );
        await session.commitTransaction();
        log(
          `           ✅ ban gaya${validCoords ? ` (pickup ${branch.zipcode})` : " — ⚠️ branch pending"}`,
        );
      } catch (e) {
        if (session.inTransaction()) await session.abortTransaction();
        log(`           ❌ fail: ${e.message}`);
      } finally {
        session.endSession();
      }
    }
  }

  // ── 5. Summary ─────────────────────────────────────────────
  hr("SUMMARY");
  log(`   orphan vendors         : ${orphans.length}`);
  log(`   profiles ${APPLY ? "banaye" : "banenge"}       : ${plan.length}`);
  const needBranch = plan.filter((p) => !p.validCoords).length;
  if (needBranch) {
    log(`   ⚠️  branch chahiye        : ${needBranch}`);
    log("      Inke orders tab tak 503 denge jab tak admin branch add");
    log("      karke default set na kare:");
    log("        POST /vendors/:id/branches");
    log("        PUT  /vendors/:id/branches/:locationId/default");
  }
  log(`   toote hue pickup branch : ${broken.length}`);

  log(
    APPLY
      ? "\n✅ REPAIR APPLIED\n"
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
