const mongoose = require("mongoose");
const Location = require("../../models/Location");
const VendorProfile = require("../../models/VendorProfile");
const VendorServiceArea = require("../../models/VendorServiceArea");
const {
  ERROR_CODES,
  LOCATION_TYPES,
  DEFAULT_COUNTRY,
} = require("../../constants");
const { throwError, validateObjectId, toTitleCase } = require("../../utils");
const { isValidZipCode } = require("../../validator/common");
const { invalidateServiceAreaCache } = require("./resolveServiceContext");

/**
 * Bulk pincode assign — ALL-OR-NOTHING.
 *
 * Ek bhi pincode doosre vendor ke paas hua to poora batch reject hota hai
 * (partial state admin ko confuse karta hai: "kya ho gaya, kya nahi").
 */
exports.addServiceAreas = async (vendorId, payload) => {
  validateObjectId(vendorId, "Vendor Id");
  const { locationId, areas } = payload;
  validateObjectId(locationId, "Location Id");

  const profile = await VendorProfile.findOne({ vendorId, isDeleted: false })
    .select("_id shopName")
    .lean();
  if (!profile) throwError(404, "Vendor not found");

  // Branch vendor ki apni honi chahiye
  const branch = await Location.findOne({
    _id: locationId,
    userId: vendorId,
    type: LOCATION_TYPES.VENDOR_BRANCH,
    isDeleted: false,
  }).lean();
  if (!branch) {
    throwError(404, "Branch not found for this vendor");
  }

  const list = Array.isArray(areas) ? areas : [areas];
  if (!list.length) throwError(422, "At least one service area is required");

  // ── 1. Validate + dedupe within the batch ──────────────────
  const seen = new Set();
  const normalized = [];
  for (const a of list) {
    const zipcode = String(a?.zipcode ?? "").trim();
    if (!zipcode) throwError(422, "Each area must include a zipcode");
    const country = toTitleCase(a?.country || branch.country) || DEFAULT_COUNTRY;
    if (!isValidZipCode(country, zipcode)) {
      throwError(422, `${zipcode} is not a valid ZIP/postal code for ${country}`);
    }
    if (seen.has(zipcode)) {
      throwError(422, `Duplicate zipcode ${zipcode} in the request`);
    }
    seen.add(zipcode);
    normalized.push({
      vendorId,
      locationId,
      zipcode,
      city: toTitleCase(a?.city ?? branch.city),
      district: toTitleCase(a?.district ?? branch.district),
      state: toTitleCase(a?.state ?? branch.state),
      country,
      etaMinutes: a?.etaMinutes,
      minOrderAmount: a?.minOrderAmount,
      freeDeliveryAbove: a?.freeDeliveryAbove,
      deliveryChargeOverride: a?.deliveryChargeOverride,
      isActive: true,
      isDeleted: false,
    });
  }

  // ── 2. Conflict check (D1 — exclusive territory) ───────────
  const existing = await VendorServiceArea.find({
    zipcode: { $in: [...seen] },
    isDeleted: false,
  })
    .select("zipcode vendorId")
    .lean();

  const mine = new Set();
  const conflicts = [];
  for (const row of existing) {
    if (String(row.vendorId) === String(vendorId)) mine.add(row.zipcode);
    else conflicts.push(row);
  }

  if (conflicts.length) {
    const otherVendorIds = [...new Set(conflicts.map((c) => String(c.vendorId)))];
    const profiles = await VendorProfile.find({
      vendorId: { $in: otherVendorIds },
    })
      .select("vendorId shopName")
      .lean();
    const nameOf = {};
    profiles.forEach((p) => {
      nameOf[String(p.vendorId)] = p.shopName;
    });
    throwError(
      409,
      `${conflicts.length} pincode(s) are already assigned to other vendors`,
      ERROR_CODES.PINCODE_ALREADY_ASSIGNED,
      {
        conflicts: conflicts.map((c) => ({
          zipcode: c.zipcode,
          vendorId: c.vendorId,
          shopName: nameOf[String(c.vendorId)] || null,
        })),
      },
    );
  }

  // ── 3. Write — sab ek transaction me ───────────────────────
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const ops = normalized.map((doc) => ({
      updateOne: {
        filter: { zipcode: doc.zipcode, isDeleted: false },
        update: { $set: doc },
        upsert: true,
      },
    }));
    await VendorServiceArea.bulkWrite(ops, { session, ordered: true });
    await session.commitTransaction();
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err; // E11000 → errorHandler ise PINCODE_ALREADY_ASSIGNED bana dega
  } finally {
    session.endSession();
  }

  // Cache invalidate — warna 5 min tak purana mapping serve hota rahega
  normalized.forEach((d) => invalidateServiceAreaCache(d.zipcode));

  const saved = await VendorServiceArea.find({
    zipcode: { $in: [...seen] },
    isDeleted: false,
  }).lean();

  return {
    created: normalized.length - mine.size,
    updated: mine.size,
    areas: saved,
  };
};
