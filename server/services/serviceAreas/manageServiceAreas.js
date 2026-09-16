const mongoose = require("mongoose");
const Location = require("../../models/Location");
const VendorProfile = require("../../models/VendorProfile");
const VendorServiceArea = require("../../models/VendorServiceArea");
const {
  ERROR_CODES,
  LOCATION_TYPES,
  DEFAULT_COUNTRY,
} = require("../../constants");
const { throwError, validateObjectId, pagination } = require("../../utils");
const {
  invalidateServiceAreaCache,
  lookupVendorForPincode,
} = require("./resolveServiceContext");

/** Vendor ke saare service areas (admin + vendor self, read-only). */
exports.getServiceAreas = async (vendorId, query = {}) => {
  validateObjectId(vendorId, "Vendor Id");
  const page = query.page ? Number(query.page) : 1;
  const limit = query.limit ? Number(query.limit) : 100;

  const match = {
    vendorId: new mongoose.Types.ObjectId(vendorId),
    isDeleted: false,
  };
  if (typeof query.isActive !== "undefined") {
    match.isActive = query.isActive === "true" || query.isActive === true;
  }
  if (query.zipcode) match.zipcode = String(query.zipcode).trim();

  const pipeline = [{ $match: match }, { $sort: { zipcode: 1 } }];
  return await pagination(VendorServiceArea, pipeline, page, limit, {
    throwOnEmpty: false,
  });
};

/** Soft delete — pincode turant free ho jata hai (partial unique index). */
exports.removeServiceArea = async (vendorId, areaId) => {
  validateObjectId(vendorId, "Vendor Id");
  validateObjectId(areaId, "Service Area Id");

  const area = await VendorServiceArea.findOne({
    _id: areaId,
    vendorId,
    isDeleted: false,
  });
  if (!area) throwError(404, "Service area not found for this vendor");

  area.isDeleted = true;
  area.isActive = false;
  await area.save();
  invalidateServiceAreaCache(area.zipcode);
  return { zipcode: area.zipcode };
};

/**
 * Ek pincode kis vendor ke paas hai — admin ke liye, add karne se pehle.
 */
exports.lookupServiceArea = async (zipcode) => {
  const zip = String(zipcode ?? "").trim();
  if (!zip) throwError(422, "zipcode is required");

  const area = await VendorServiceArea.findOne({
    zipcode: zip,
    isDeleted: false,
  }).lean();
  if (!area) return { zipcode: zip, assigned: false, vendor: null };

  const profile = await VendorProfile.findOne({ vendorId: area.vendorId })
    .select("shopName status")
    .lean();

  return {
    zipcode: zip,
    assigned: true,
    isActive: area.isActive,
    areaId: area._id,
    vendor: {
      id: area.vendorId,
      shopName: profile?.shopName ?? null,
      status: profile?.status ?? null,
    },
  };
};

/**
 * Territory transfer — ek vendor se doosre ko. Purani row soft-delete,
 * nayi create — dono ek transaction me. Chup-chaap overwrite kabhi nahi.
 */
exports.reassignServiceArea = async (payload) => {
  const { zipcode, toVendorId, toLocationId } = payload;
  const zip = String(zipcode ?? "").trim();
  if (!zip) throwError(422, "zipcode is required");
  validateObjectId(toVendorId, "Vendor Id");
  validateObjectId(toLocationId, "Location Id");

  const profile = await VendorProfile.findOne({
    vendorId: toVendorId,
    isDeleted: false,
  })
    .select("shopName")
    .lean();
  if (!profile) throwError(404, "Target vendor not found");

  const branch = await Location.findOne({
    _id: toLocationId,
    userId: toVendorId,
    type: LOCATION_TYPES.VENDOR_BRANCH,
    isDeleted: false,
  }).lean();
  if (!branch) throwError(404, "Branch not found for the target vendor");

  const current = await VendorServiceArea.findOne({
    zipcode: zip,
    isDeleted: false,
  }).lean();

  if (current && String(current.vendorId) === String(toVendorId)) {
    throwError(
      409,
      `Pincode ${zip} is already assigned to ${profile.shopName}`,
      ERROR_CODES.PINCODE_ALREADY_ASSIGNED,
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (current) {
      await VendorServiceArea.updateOne(
        { _id: current._id },
        { $set: { isDeleted: true, isActive: false } },
        { session },
      );
    }
    await VendorServiceArea.create(
      [
        {
          vendorId: toVendorId,
          locationId: toLocationId,
          zipcode: zip,
          city: branch.city,
          district: branch.district,
          state: branch.state,
          country: branch.country || DEFAULT_COUNTRY,
          isActive: true,
          isDeleted: false,
        },
      ],
      { session },
    );
    await session.commitTransaction();
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  invalidateServiceAreaCache(zip);
  return {
    zipcode: zip,
    from: current?.vendorId ?? null,
    to: toVendorId,
    shopName: profile.shopName,
  };
};

/**
 * Customer-facing serviceability check. App ka pehla call.
 * 404 deta hai taaki app "not serviceable" screen dikha sake.
 */
exports.checkServiceability = async (zipcode) => {
  const zip = String(zipcode ?? "").trim();
  if (!zip) {
    throwError(422, "zipcode is required", ERROR_CODES.PINCODE_REQUIRED);
  }

  const vendor = await lookupVendorForPincode(zip);
  if (!vendor) {
    throwError(
      404,
      `We don't deliver to ${zip} yet`,
      ERROR_CODES.PINCODE_NOT_SERVICEABLE,
      { zipcode: zip },
    );
  }

  return {
    serviceable: true,
    zipcode: zip,
    vendor: {
      id: vendor.vendorId,
      shopName: vendor.shopName,
      logo: vendor.logo,
      etaMinutes: vendor.etaMinutes,
      minOrderAmount: vendor.minOrderAmount,
      freeDeliveryAbove: vendor.freeDeliveryAbove,
    },
  };
};
