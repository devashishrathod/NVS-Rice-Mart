const Product = require("../../models/Product");
const { throwError, validateObjectId } = require("../../utils");
const { deleteImage } = require("../uploads");

exports.deleteProduct = async (id) => {
  validateObjectId(id, "Product Id");
  const result = await Product.findById(id);
  if (!result || result.isDeleted) throwError(404, "Product not found");
  await deleteImage(result?.image);
  result.image = null;
  result.isDeleted = true;
  result.isActive = false;
  result.updatedAt = new Date();
  await result.save();
  return;
};
