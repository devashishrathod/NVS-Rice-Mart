const mongoose = require("mongoose");
const User = require("../../models/User");
const Location = require("../../models/Location");
const { ROLES } = require("../../constants");
const { validateObjectId, throwError } = require("../../utils");
const { isValidZipCode } = require("../../validator/common");

/**
 * @param {{ userId: any, role: string }} actor logged-in user
 * @param {object} payload
 */
exports.createLocation = async (actor, payload) => {
  let {
    userId,
    name,
    shopOrBuildingNumber,
    address,
    area,
    state,
    city,
    district,
    country,
    zipcode,
    formattedAddress,
    coordinates,
    isDefault,
  } = payload;

  // 🔒 Kisi DOOSRE user ke liye address sirf admin bana sakta hai. Pehle
  // koi bhi payload me userId bhej ke dusre ke account me address daal
  // sakta tha (aur uska default address hijack kar sakta tha).
  if (userId && String(userId) !== String(actor.userId)) {
    if (actor.role !== ROLES.ADMIN) {
      throwError(403, "You can only add an address to your own account");
    }
    validateObjectId(userId, "User Id");
  } else {
    userId = actor.userId;
  }

  const user = await User.findById(userId);
  if (!user || user.isDeleted) throwError(404, "User not found");

  country = country?.toLowerCase() || "india";
  if (!address || !city || !district || !zipcode || !state || !coordinates) {
    throwError(
      422,
      "Please provide coordinates(Lat & Long), address, city, district, zipcode, state.",
    );
  }
  if (!isValidZipCode(country, zipcode)) {
    throwError(422, `${zipcode} is not a valid ZIP/postal code for ${country}`);
  }

  const locationData = {
    userId,
    name: name?.toLowerCase(),
    shopOrBuildingNumber: shopOrBuildingNumber?.toLowerCase(),
    address: address?.toLowerCase(),
    area: area?.toLowerCase(),
    city: city?.toLowerCase(),
    district: district?.toLowerCase(),
    zipcode,
    state: state?.toLowerCase(),
    country,
    formattedAddress: formattedAddress
      ? formattedAddress.toLowerCase()
      : `${address?.toLowerCase()}, ${city?.toLowerCase()}, ${district?.toLowerCase()}, ${state?.toLowerCase()}, ${zipcode}, ${country}`.trim(),
    coordinates,
  };

  // Pehla address hamesha default banta hai; uske baad tabhi jab client
  // explicitly bole.
  const existingCount = await Location.countDocuments({
    userId,
    isDeleted: false,
  });
  const shouldBeDefault = existingCount === 0 || isDefault === true;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (shouldBeDefault) {
      // single-default invariant
      await Location.updateMany(
        { userId, isDeleted: false, isDefault: true },
        { $set: { isDefault: false } },
        { session },
      );
    }
    const [location] = await Location.create(
      [{ ...locationData, isDefault: shouldBeDefault }],
      { session },
    );
    if (shouldBeDefault) {
      // `locationId` ab sirf default address ko point karta hai — pehle har
      // naye address pe blindly overwrite ho jata tha.
      user.locationId = location._id;
      await user.save({ session });
    }
    await session.commitTransaction();
    return location;
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
