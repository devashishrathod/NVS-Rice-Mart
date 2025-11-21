const { asyncWrapper, sendSuccess } = require("../../utils");
const { deleteProduct } = require("../../services/products");

exports.deleteProduct = asyncWrapper(async (req, res) => {
  await deleteProduct(req.params?.id);
  return sendSuccess(res, 200, "Product deleted successfully");
});
