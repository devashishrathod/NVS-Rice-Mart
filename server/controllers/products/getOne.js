const {
  asyncWrapper,
  sendSuccess,
  throwError,
  validateObjectId,
} = require("../../utils");
const { getProduct } = require("../../services/products");

exports.getOne = asyncWrapper(async (req, res) => {
  const productId = req.params.id;
  validateObjectId(productId, "ProductId");
  const result = await getProduct(productId, req.serviceContext);
  if (!result) throwError(404, "Product not found");
  return sendSuccess(res, 200, "Product fetched successfully", result);
});
