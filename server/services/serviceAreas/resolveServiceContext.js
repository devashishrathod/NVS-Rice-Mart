const User = require("../../models/User");
const Location = require("../../models/Location");
const VendorProfile = require("../../models/VendorProfile");
const VendorServiceArea = require("../../models/VendorServiceArea");
const {
  ROLES,
  ERROR_CODES,
  LOCATION_TYPES,
  VENDOR_STATUS,
} = require("../../constants");
const { throwError } = require("../../utils");
const { serviceAreaCache } = require("../../utils/ttlCache");

const CACHE_PREFIX = "sa:";
const key = (zipcode) => `${CACHE_PREFIX}${zipcode}`;

/**
 * Ek pincode kaun serve karta hai — cached lookup.
 * @returns {{ vendorId, shopName, logo, servingLocationId, etaMinutes,
 *             minOrderAmount, freeDeliveryAbove, deliveryChargeOverride } | null}
 */
const lookupVendorForPincode = async (zipcode) => {
  const cached = serviceAreaCache.get(key(zipcode));
  if (cached !== undefined) return cached; // `null` bhi cache hota hai

  // D1: ek pincode = ek vendor, isliye findOne
  const area = await VendorServiceArea.findOne({
    zipcode,
    isActive: true,
    isDeleted: false,
  })
    .select(
      "vendorId locationId etaMinutes minOrderAmount freeDeliveryAbove deliveryChargeOverride",
    )
    .lean();

  if (!area) {
    serviceAreaCache.set(key(zipcode), null);
    return null;
  }

  // Vendor live hai? (suspended/deleted vendor ka catalog nahi dikhna chahiye)
  const [vendor, profile] = await Promise.all([
    User.findOne({
      _id: area.vendorId,
      role: ROLES.VENDOR,
      isActive: true,
      isDeleted: false,
    })
      .select("_id")
      .lean(),
    VendorProfile.findOne({
      vendorId: area.vendorId,
      status: VENDOR_STATUS.APPROVED,
      isDeleted: false,
    })
      .select("shopName logo defaultLocationId delivery")
      .lean(),
  ]);

  if (!vendor || !profile) {
    serviceAreaCache.set(key(zipcode), null);
    return null;
  }

  const resolved = {
    vendorId: area.vendorId,
    shopName: profile.shopName,
    logo: profile.logo || null,
    defaultLocationId: profile.defaultLocationId,
    servingLocationId: area.locationId,
    etaMinutes: area.etaMinutes ?? null,
    minOrderAmount: area.minOrderAmount ?? profile.delivery?.minOrderAmount ?? 0,
    freeDeliveryAbove:
      area.freeDeliveryAbove ?? profile.delivery?.freeDeliveryAbove ?? null,
    deliveryChargeOverride: area.deliveryChargeOverride ?? null,
  };
  serviceAreaCache.set(key(zipcode), resolved);
  return resolved;
};

/**
 * Service-area / vendor / branch badalne pe cache invalidate karo.
 * Zipcode pata ho to usi key ko maaro, warna poora prefix.
 */
const invalidateServiceAreaCache = (zipcode) => {
  if (zipcode) serviceAreaCache.del(key(zipcode));
  else serviceAreaCache.delByPrefix(CACHE_PREFIX);
};

/**
 * Customer ka pincode nikaal ke uska vendor resolve karta hai.
 *
 * Priority — EXPLICIT params hamesha pehle, default sirf fallback hai:
 *   1. `locationId` query param (customer ne address picker se choose kiya)
 *   2. `zipcode` query param ("deliver to" picker — customer ne khud daala)
 *   3. customer ka default Location (isDefault: true)
 *
 * ⚠️ Default ko explicit param se UPAR mat rakhna — warna jis customer ka
 *    address save hai wo "deliver to" picker se doosra pincode check hi
 *    nahi kar payega (uska default hamesha jeet jayega).
 *
 * @throws 400 PINCODE_REQUIRED        — koi address/pincode nahi mila
 * @throws 404 PINCODE_NOT_SERVICEABLE — us pincode pe koi live vendor nahi
 */
exports.resolveServiceContext = async ({ zipcode, locationId, userId }) => {
  let pincode;

  if (locationId) {
    const loc = await Location.findOne({
      _id: locationId,
      userId,
      isDeleted: false,
    })
      .select("zipcode")
      .lean();
    if (!loc) throwError(404, "Delivery address not found");
    pincode = loc.zipcode;
  }

  if (!pincode && zipcode) pincode = String(zipcode).trim();

  if (!pincode && userId) {
    const def = await Location.findOne({
      userId,
      type: LOCATION_TYPES.CUSTOMER,
      isDefault: true,
      isDeleted: false,
    })
      .select("zipcode")
      .lean();
    pincode = def?.zipcode;
  }

  if (!pincode) {
    throwError(
      400,
      "Please select a delivery location",
      ERROR_CODES.PINCODE_REQUIRED,
    );
  }

  const vendor = await lookupVendorForPincode(pincode);
  if (!vendor) {
    throwError(
      404,
      `We don't deliver to ${pincode} yet`,
      ERROR_CODES.PINCODE_NOT_SERVICEABLE,
      { zipcode: pincode },
    );
  }

  return {
    pincode,
    vendorId: vendor.vendorId,
    // Services ka filter uniform rakhne ke liye array bhi deta hoon
    // (customer ke liye hamesha length 1). Kabhi multi-vendor pe jaana ho
    // to sirf ye file badlegi, services/controllers nahi.
    vendorIds: [vendor.vendorId],
    vendor,
  };
};

exports.lookupVendorForPincode = lookupVendorForPincode;
exports.invalidateServiceAreaCache = invalidateServiceAreaCache;
