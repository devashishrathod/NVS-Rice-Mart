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
  const locationIds = [];
  const locationZipMap = {};
  for (const loc of locations) {
    if (!loc?.locationId) {
      throwError(400, "Each location must include locationId");
    }
    validateObjectId(loc.locationId, "Location Id");
    locationIds.push(loc.locationId);
  }
  const validLocations = await Location.find({
    _id: { $in: locationIds },
    isDeleted: false,
  }).lean();
  if (validLocations.length !== locationIds.length) {
    throwError(404, "One or more locations not found");
  }
  for (const loc of validLocations) {
    locationZipMap[loc._id.toString()] = loc.zipcode;
  }
  const bulk = locations.map((loc) => ({
    updateOne: {
      filter: {
        productId,
        locationId: loc.locationId,
      },
      update: {
        $set: {
          isActive: true,
          isDeleted: false,
          zipcode: locationZipMap[loc.locationId.toString()],
          price: loc.price ?? product.generalPrice ?? 0,
          stockQuantity: loc.stockQuantity ?? product.stockQuantity ?? 0,
        },
      },
      upsert: true,
    },
  }));
  await ProductLocation.bulkWrite(bulk);
};
