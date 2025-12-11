const Product = require("../../models/Product");
const ProductLocation = require("../../models/ProductLocation");
const Location = require("../../models/Location");
const { throwError, validateObjectId } = require("../../utils");

exports.addOrUpdateLocations = async (productId, payload) => {
  validateObjectId(productId, "Product Id");
  const product = await Product.findById(productId);
  if (!product || product?.isDeleted) throwError(404, "Product not found");
  let { locations } = payload;
  locations = Array.isArray(locations) ? locations : [locations];
  for (const loc of locations) {
    if (!loc || !loc.locationId) {
      throwError(400, "Each location must include locationId");
    }
    validateObjectId(loc?.locationId, "Location Id");
    const validLoc = await Location.findById(loc?.locationId);
    if (!validLoc || validLoc?.isDeleted) throwError(404, "Location not found");
  }
  const bulk = locations.map((loc) => ({
    updateOne: {
      filter: { productId, locationId: loc.locationId },
      update: {
        $set: {
          isActive: true,
          isDeleted: false,
          price: loc?.price ?? product?.generalPrice ?? 0,
          stockQuantity: loc?.stockQuantity ?? product?.stockQuantity ?? 0,
        },
      },
      upsert: true,
    },
  }));
  await ProductLocation.bulkWrite(bulk);
};
