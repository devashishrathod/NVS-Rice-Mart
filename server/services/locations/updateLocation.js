const mongoose = require("mongoose");
const User = require("../../models/User");
const Location = require("../../models/Location");
const { ROLES, LOCATION_TYPES } = require("../../constants");
const { throwError, validateObjectId } = require("../../utils");
const { isValidZipCode } = require("../../validator/common");

const EDITABLE = [
  "name",
  "shopOrBuildingNumber",
  "address",
  "area",
  "city",
  "district",
  "state",
  "country",
  "zipcode",
  "formattedAddress",
];

const loadOwned = async (locationId, actor) => {
  validateObjectId(locationId, "Location Id");
  const location = await Location.findById(locationId);
  if (!location || location.isDeleted) throwError(404, "Location not found");
  const isOwner = String(location.userId ?? "") === String(actor.userId);
  const isAdmin = actor.role === ROLES.ADMIN || actor.role === ROLES.STAFF;
  // 404 (403 nahi) — warna ID guess karke address ka existence pata chalta hai
  if (!isOwner && !isAdmin) throwError(404, "Location not found");
  return location;
};

/**
 * Address ko default banao. Single-default invariant transaction me enforce
 * hota hai, aur `user.locationId` bhi sync rehta hai (usi se
 * `resolveServiceContext` customer ka pincode uthata hai).
 */
exports.setDefaultLocation = async (locationId, actor) => {
  const location = await loadOwned(locationId, actor);
  if (!location.zipcode) {
    throwError(422, "This address has no pincode — please edit it first");
  }

  const ownerId = location.userId;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Location.updateMany(
      { userId: ownerId, type: location.type, isDeleted: false },
      { $set: { isDefault: false } },
      { session },
    );
    await Location.updateOne(
      { _id: location._id },
      { $set: { isDefault: true } },
      { session },
    );
    // Vendor branch ka default alag API se set hota hai; yahan sirf
    // customer ka pointer sync karna hai.
    if (location.type === LOCATION_TYPES.CUSTOMER) {
      await User.updateOne(
        { _id: ownerId },
        { $set: { locationId: location._id } },
        { session },
      );
    }
    await session.commitTransaction();
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  return await Location.findById(location._id).lean();
};

exports.updateLocation = async (locationId, payload, actor) => {
  const location = await loadOwned(locationId, actor);

  let changed = false;
  for (const field of EDITABLE) {
    if (payload?.[field] === undefined) continue;
    const value =
      field === "zipcode" ? String(payload[field]).trim() : payload[field];
    location[field] =
      typeof value === "string" && field !== "zipcode"
        ? value.toLowerCase()
        : value;
    changed = true;
  }

  if (payload?.coordinates !== undefined) {
    const c = payload.coordinates;
    if (!Array.isArray(c) || c.length !== 2 || !Number(c[0]) || !Number(c[1])) {
      throwError(422, "Coordinates must be a valid [latitude, longitude]");
    }
    location.coordinates = c;
    changed = true;
  }

  if (!changed && payload?.isDefault === undefined) {
    throwError(422, "At least one field is required to update");
  }

  const country = (location.country || "india").toLowerCase();
  if (location.zipcode && !isValidZipCode(country, location.zipcode)) {
    throwError(
      422,
      `${location.zipcode} is not a valid ZIP/postal code for ${country}`,
    );
  }

  if (changed) await location.save();

  if (payload?.isDefault === true && !location.isDefault) {
    return await exports.setDefaultLocation(location._id, actor);
  }
  return await Location.findById(location._id).lean();
};
