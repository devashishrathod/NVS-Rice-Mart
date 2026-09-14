const mongoose = require("mongoose");
const User = require("../../models/User");
const Location = require("../../models/Location");
const { ROLES, LOCATION_TYPES } = require("../../constants");
const { throwError, validateObjectId } = require("../../utils");

/**
 * @param {{ userId: any, role: string }} actor
 */
exports.deleteLocation = async (actor, locationId) => {
  validateObjectId(locationId, "Location Id");
  const location = await Location.findById(locationId);
  if (!location || location.isDeleted) throwError(404, "Location not found");

  // Pehle yahan `User.findById(...)` ka DOCUMENT string se compare hota tha
  // (`userRole !== ROLES.ADMIN`) — wo hamesha true rehta tha, isliye admin
  // bhi kabhi paas nahi hota tha. Ab role seedha token se aata hai.
  const isOwner = String(location.userId ?? "") === String(actor.userId);
  const isAdmin = actor.role === ROLES.ADMIN;
  if (!isOwner && !isAdmin) throwError(403, "Unauthorized access");

  // Vendor ka default branch delete nahi hona chahiye — uske bina us vendor
  // ka har order 503 VENDOR_PICKUP_MISSING dega.
  if (location.type === LOCATION_TYPES.VENDOR_BRANCH && location.isDefault) {
    throwError(
      409,
      "This is the vendor's default pickup branch — set another branch as default first",
    );
  }

  const wasDefault = location.isDefault;
  const ownerId = location.userId;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Location.updateOne(
      { _id: location._id },
      { $set: { isDeleted: true, isActive: false, isDefault: false } },
      { session },
    );

    if (wasDefault && ownerId) {
      // Default address hata diya to koi doosra promote karo — warna
      // customer ke paas address hote hue bhi PINCODE_REQUIRED milega.
      const next = await Location.findOne({
        userId: ownerId,
        type: location.type,
        isDeleted: false,
        _id: { $ne: location._id },
      })
        .sort({ createdAt: -1 })
        .session(session);

      if (next) {
        await Location.updateOne(
          { _id: next._id },
          { $set: { isDefault: true } },
          { session },
        );
      }
      if (location.type === LOCATION_TYPES.CUSTOMER) {
        await User.updateOne(
          { _id: ownerId },
          { $set: { locationId: next?._id ?? null } },
          { session },
        );
      }
    }

    await session.commitTransaction();
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
  return;
};
