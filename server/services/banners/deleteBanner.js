const Banner = require("../../models/Banner");
const { throwError, validateObjectId } = require("../../utils");

exports.deleteBanner = async (id) => {
  validateObjectId(id, "Banner Id");
  const result = await Banner.findById(id);
  if (!result || result.isDeleted) throwError(404, "Banner not found");
  result.isDeleted = true;
  result.isActive = false;
  result.updatedAt = new Date();
  await result.save();
  return;
};
