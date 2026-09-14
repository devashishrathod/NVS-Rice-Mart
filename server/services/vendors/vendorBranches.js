const mongoose = require("mongoose");
const Location = require("../../models/Location");
const User = require("../../models/User");
const VendorProfile = require("../../models/VendorProfile");
const { LOCATION_TYPES } = require("../../constants");
const { throwError, validateObjectId } = require("../../utils");
const { isValidZipCode } = require("../../validator/common");
const { bustVendorCache } = require("./updateVendor");

exports.getBranches = async (vendorId) => {
  validateObjectId(vendorId, "Vendor Id");
  return await Location.find({
    userId: vendorId,
    type: LOCATION_TYPES.VENDOR_BRANCH,
    isDeleted: false,
  })
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();
};

exports.createBranch = async (vendorId, payload) => {
  validateObjectId(vendorId, "Vendor Id");
  const profile = await VendorProfile.findOne({ vendorId, isDeleted: false });
  if (!profile) throwError(404, "Vendor not found");

  const {
    address,
    city,
    district,
    state,
    zipcode,
    coordinates,
    country = "india",
    isDefault,
  } = payload;
  if (!address || !city || !district || !state || !zipcode || !coordinates) {
    throwError(
      422,
      "Branch needs address, city, district, state, zipcode and coordinates(Lat & Long)",
    );
  }
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    throwError(422, "Branch coordinates must be [latitude, longitude]");
  }
  if (!isValidZipCode(country, zipcode)) {
    throwError(422, `${zipcode} is not a valid ZIP/postal code for ${country}`);
  }

  // Pehli branch hamesha default (warna order place hi nahi hoga)
  const existing = await Location.countDocuments({
    userId: vendorId,
    type: LOCATION_TYPES.VENDOR_BRANCH,
    isDeleted: false,
  });
  const shouldBeDefault = existing === 0 || isDefault === true;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (shouldBeDefault) {
      await Location.updateMany(
        {
          userId: vendorId,
          type: LOCATION_TYPES.VENDOR_BRANCH,
          isDeleted: false,
          isDefault: true,
        },
        { $set: { isDefault: false } },
        { session },
      );
    }
    const [branch] = await Location.create(
      [
        {
          userId: vendorId,
          type: LOCATION_TYPES.VENDOR_BRANCH,
          name: payload.name?.toLowerCase(),
          shopOrBuildingNumber: payload.shopOrBuildingNumber?.toLowerCase(),
          address: address.toLowerCase(),
          area: payload.area?.toLowerCase(),
          city: city.toLowerCase(),
          district: district.toLowerCase(),
          state: state.toLowerCase(),
          country: country.toLowerCase(),
          zipcode,
          formattedAddress:
            payload.formattedAddress?.toLowerCase() ||
            `${address}, ${city}, ${district}, ${state}, ${zipcode}, ${country}`.toLowerCase(),
          coordinates,
          isDefault: shouldBeDefault,
          isActive: true,
        },
      ],
      { session },
    );
    if (shouldBeDefault) {
      await VendorProfile.updateOne(
        { vendorId },
        { $set: { defaultLocationId: branch._id } },
        { session },
      );
      await User.updateOne(
        { _id: vendorId },
        { $set: { locationId: branch._id } },
        { session },
      );
    }
    await session.commitTransaction();
    if (shouldBeDefault) await bustVendorCache(vendorId);
    return branch;
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * ⚠️ Default branch = pickup point. Ise badalne se us vendor ke SAARE naye
 * orders ka distance aur delivery charge badal jayega.
 */
exports.setDefaultBranch = async (vendorId, locationId) => {
  validateObjectId(vendorId, "Vendor Id");
  validateObjectId(locationId, "Location Id");

  const branch = await Location.findOne({
    _id: locationId,
    userId: vendorId,
    type: LOCATION_TYPES.VENDOR_BRANCH,
    isDeleted: false,
  }).lean();
  if (!branch) throwError(404, "Branch not found for this vendor");
  if (!Array.isArray(branch.coordinates) || branch.coordinates.length !== 2) {
    throwError(422, "This branch has no coordinates — set them first");
  }
  const [lat, lng] = branch.coordinates;
  if (!lat || !lng) {
    throwError(422, "This branch has invalid coordinates [0,0] — fix them first");
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // single-default invariant
    await Location.updateMany(
      { userId: vendorId, type: LOCATION_TYPES.VENDOR_BRANCH, isDeleted: false },
      { $set: { isDefault: false } },
      { session },
    );
    await Location.updateOne(
      { _id: locationId },
      { $set: { isDefault: true } },
      { session },
    );
    await VendorProfile.updateOne(
      { vendorId },
      { $set: { defaultLocationId: locationId } },
      { session },
    );
    await User.updateOne(
      { _id: vendorId },
      { $set: { locationId } },
      { session },
    );
    await session.commitTransaction();
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  await bustVendorCache(vendorId);
  return { locationId, zipcode: branch.zipcode, isDefault: true };
};
