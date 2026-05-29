const Location = require("../../models/Location");
const { throwError, validateObjectId } = require("../../utils");

exports.deleteLocation = async (userId, locationId) => {
  validateObjectId(locationId, "Location Id");
  const result = await Location.findById(locationId);
  if (!result || result.isDeleted) throwError(404, "Location not found");
  if (result?.userId?.toString() !== userId.toString()) {
    throwError(403, "Unauthorized access");
  }
  result.isDeleted = true;
  result.isActive = false;
  result.updatedAt = new Date();
  await result.save();
  return;
};
