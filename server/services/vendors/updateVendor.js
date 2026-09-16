const User = require("../../models/User");
const VendorProfile = require("../../models/VendorProfile");
const VendorServiceArea = require("../../models/VendorServiceArea");
const { ROLES, VENDOR_STATUS } = require("../../constants");
const { throwError, validateObjectId, toTitleCase } = require("../../utils");
const { invalidateServiceAreaCache } = require("../serviceAreas");
const { getVendor } = require("./getVendors");

// Profile ke ye fields ADMIN update karta hai (shop name, mobile, address,
// branches, GST, payout — sab admin ke haath me).
const PROFILE_FIELDS = [
  "shopName",
  "legalName",
  "gstNumber",
  "fssaiNumber",
  "logo",
  "supportMobile",
  "payout",
];
// Ye bhi admin-only — vendor apna commission ya status nahi badal sakta
const ADMIN_ONLY_FIELDS = ["commissionPercent", "status"];

/**
 * 🏪 Delivery config ke fields — VENDOR khud edit kar sakta hai.
 *    `isEnabled` master switch bhi isi me hai.
 */
const DELIVERY_FIELDS = [
  "isEnabled",
  "baseCharge",
  "perKmRate",
  "perKgRate",
  "minDeliveryCharge",
  "baseMaxCharge",
  "maxPerKgIncrement",
  "maxPerKmIncrement",
  "freeDeliveryAbove",
  "minOrderAmount",
  "maxRadiusKm",
];

const applyDelivery = (profile, delivery) => {
  let changed = false;
  for (const f of DELIVERY_FIELDS) {
    if (delivery[f] !== undefined) {
      profile.delivery[f] = delivery[f];
      changed = true;
    }
  }
  return changed;
};

exports.updateVendor = async (vendorId, payload, actor) => {
  validateObjectId(vendorId, "Vendor Id");
  const profile = await VendorProfile.findOne({ vendorId, isDeleted: false });
  if (!profile) throwError(404, "Vendor not found");

  const isAdmin = actor?.role === ROLES.ADMIN || actor?.role === ROLES.STAFF;
  let changed = false;

  for (const f of PROFILE_FIELDS) {
    if (payload?.[f] !== undefined) {
      if (!isAdmin) throwError(403, `Only an admin can change ${f}`);
      profile[f] = payload[f];
      changed = true;
    }
  }
  for (const f of ADMIN_ONLY_FIELDS) {
    if (payload?.[f] !== undefined) {
      if (!isAdmin) throwError(403, `Only an admin can change ${f}`);
      profile[f] = payload[f];
      changed = true;
    }
  }
  if (payload?.delivery && typeof payload.delivery === "object") {
    if (applyDelivery(profile, payload.delivery)) changed = true;
  }

  // Vendor user ke basic fields — sirf admin
  if (payload?.name !== undefined || payload?.mobile !== undefined) {
    if (!isAdmin) throwError(403, "Only an admin can change name or mobile");
    const user = await User.findById(vendorId);
    if (!user) throwError(404, "Vendor user not found");
    if (payload.name !== undefined) user.name = toTitleCase(payload.name);
    if (payload.mobile !== undefined && payload.mobile !== user.mobile) {
      const clash = await User.findOne({
        mobile: payload.mobile,
        role: ROLES.VENDOR,
        _id: { $ne: vendorId },
        isDeleted: false,
      }).lean();
      if (clash) throwError(409, "Another vendor already uses this mobile");
      user.mobile = payload.mobile;
    }
    await user.save();
    changed = true;
  }

  if (!changed) throwError(422, "At least one valid field is required");
  await profile.save();

  // Profile badla to cached zipcode→vendor entries stale ho gayi
  // (shopName/delivery/status sab cache me jaata hai)
  await bustVendorCache(vendorId);
  return await getVendor(vendorId);
};

/**
 * 🏪 Vendor apni DELIVERY settings khud manage karta hai.
 *    Baaki kuch nahi — shop name, mobile, address, branches, service areas,
 *    commission, status: sab admin ke haath me.
 */
exports.updateVendorDelivery = async (vendorId, delivery) => {
  validateObjectId(vendorId, "Vendor Id");
  const profile = await VendorProfile.findOne({ vendorId, isDeleted: false });
  if (!profile) throwError(404, "Vendor not found");

  if (!delivery || typeof delivery !== "object" || !applyDelivery(profile, delivery)) {
    throwError(422, "At least one delivery setting is required");
  }
  await profile.save();
  await bustVendorCache(vendorId);

  return { vendorId, delivery: profile.delivery };
};

/**
 * Status change alag endpoint pe hai kyunki iska asar turant customers pe
 * padta hai — SUSPENDED hote hi catalog gayab ho jata hai.
 */
exports.updateVendorStatus = async (vendorId, status) => {
  validateObjectId(vendorId, "Vendor Id");
  if (!Object.values(VENDOR_STATUS).includes(status)) {
    throwError(422, `status must be one of ${Object.values(VENDOR_STATUS).join(", ")}`);
  }
  const profile = await VendorProfile.findOne({ vendorId, isDeleted: false });
  if (!profile) throwError(404, "Vendor not found");

  profile.status = status;
  await profile.save();
  await bustVendorCache(vendorId);

  return { vendorId, status, shopName: profile.shopName };
};

/** Us vendor ke saare pincodes ka cache clear karo. */
const bustVendorCache = async (vendorId) => {
  const areas = await VendorServiceArea.find({ vendorId, isDeleted: false })
    .select("zipcode")
    .lean();
  areas.forEach((a) => invalidateServiceAreaCache(a.zipcode));
};

exports.bustVendorCache = bustVendorCache;
