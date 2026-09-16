const mongoose = require("mongoose");
const User = require("../../models/User");
const Location = require("../../models/Location");
const { ROLES, LOCATION_TYPES, DEFAULT_COUNTRY } = require("../../constants");
const { throwError, validateObjectId, toTitleCase } = require("../../utils");
const { isValidZipCode } = require("../../validator/common");
const { buildFormattedAddress } = require("../../helpers/locations");

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

// Inme se koi badla to `formattedAddress` dobara banana padta hai
const ADDRESS_PARTS = [
  "address",
  "city",
  "district",
  "state",
  "zipcode",
  "country",
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
    // `zipcode` digits hai — uspe casing nahi lagti, sirf trim.
    location[field] =
      field === "zipcode"
        ? String(payload[field]).trim()
        : toTitleCase(payload[field]);
    changed = true;
  }

  if (payload?.coordinates !== undefined) {
    const c = payload.coordinates;
    const lat = Number(c?.[0]);
    const lng = Number(c?.[1]);
    // ⚠️ Pehle yahan `!Number(c[0])` tha — wo latitude/longitude 0 ko bhi
    // reject kar deta tha (0 falsy hai). `Number.isFinite` sahi check hai.
    if (
      !Array.isArray(c) ||
      c.length !== 2 ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      throwError(422, "Coordinates must be a valid [latitude, longitude]");
    }
    location.coordinates = [lat, lng];
    changed = true;
  }

  if (!changed && payload?.isDefault === undefined) {
    throwError(422, "At least one field is required to update");
  }

  // 🆕 Address ka koi hissa badla aur client ne khud `formattedAddress` nahi
  // bheja → dobara bana do. Pehle ye stale reh jata tha: city badalne ke
  // baad bhi `formattedAddress` me purani city dikhti rehti thi.
  const partChanged = ADDRESS_PARTS.some((f) => payload?.[f] !== undefined);
  if (partChanged && payload?.formattedAddress === undefined) {
    location.formattedAddress = buildFormattedAddress({
      address: location.address,
      city: location.city,
      district: location.district,
      state: location.state,
      zipcode: location.zipcode,
      country: location.country,
    });
  }

  // `isValidZipCode()` country ko case-insensitive padhta hai, isliye yahan
  // lowercase karne ki zarurat nahi.
  const country = location.country || DEFAULT_COUNTRY;
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
