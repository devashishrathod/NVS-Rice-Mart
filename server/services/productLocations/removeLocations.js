const Product = require("../../models/Product");
const Location = require("../../models/Location");
const ProductLocation = require("../../models/ProductLocation");
const { throwError, validateObjectId } = require("../../utils");

exports.removeLocations = async (productId, payload) => {
  validateObjectId(productId, "Product Id");
  const product = await Product.findById(productId);
  if (!product || product?.isDeleted) throwError(404, "Product not found");
  let { locationIds } = payload;
  locationIds = Array.isArray(locationIds) ? locationIds : [locationIds];
  for (const locId of locationIds) {
    if (!locId) throwError(400, "locations must include locationId");
    validateObjectId(locId, "Location Id");
    const validLoc = await Location.findById(locId);
    if (!validLoc) throwError(404, "Location not found"); // isDeleted location not matched
  }
  const bulk = locationIds.map((locationId) => ({
    updateOne: {
      filter: { productId, locationId },
      update: {
        $set: {
          isDeleted: true,
          isActive: false,
        },
      },
      upsert: true,
    },
  }));
  await ProductLocation.bulkWrite(bulk);
};
