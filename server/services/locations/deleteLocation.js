const Location = require("../../models/Location");
const User = require("../../models/User");
const { throwError, validateObjectId } = require("../../utils");
const { ROLES } = require("../../constants");

exports.deleteLocation = async (userId, locationId) => {
  validateObjectId(locationId, "Location Id");
  const result = await Location.findById(locationId);
  if (!result || result.isDeleted) throwError(404, "Location not found");
  const userRole = await User.findById(userId).select("role");
  if (
    userRole !== ROLES.ADMIN &&
    result?.userId?.toString() !== userId.toString()
  ) {
    throwError(403, "Unauthorized access");
  } else if (userRole === ROLES.ADMIN && !result.isProductAddress) {
    throwError(403, "Admin can only delete product address");
  }
  result.isDeleted = true;
  result.isActive = false;
  result.updatedAt = new Date();
  await result.save();
  return;
};
