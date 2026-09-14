const Product = require("../../models/Product");
const { throwError, validateObjectId } = require("../../utils");
const { assertOwnership } = require("../assertOwnership");
const { deleteImage } = require("../uploads");

exports.deleteProduct = async (id, actor) => {
  validateObjectId(id, "Product Id");
  const product = await Product.findById(id);
  if (!product || product.isDeleted) throwError(404, "Product not found");
  assertOwnership(product, actor, "product");

  await deleteImage(product?.image);
  product.image = null;
  product.isDeleted = true;
  product.isActive = false;
  await product.save();
  return;
};
