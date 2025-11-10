const {
  asyncWrapper,
  sendSuccess,
  throwError,
  validateObjectId,
} = require("../../utils");
const { getProduct } = require("../../services/products");

exports.getOne = asyncWrapper(async (req, res) => {
  const paroductId = req.params.id;
  validateObjectId(paroductId, "ProductId");
  const result = await getProduct(paroductId);
  if (!result) throwError(404, "Product not found");
  return sendSuccess(res, 200, "Product fetched successfully", result);
});
