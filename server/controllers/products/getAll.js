const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { getAllProducts } = require("../../services/products");
const { validateGetAllProductsQuery } = require("../../validator/products");

exports.getAll = asyncWrapper(async (req, res) => {
  const { error } = validateGetAllProductsQuery(req.query);
  if (error) throwError(422, cleanJoiError(error));
  const result = await getAllProducts(req.query);
  return sendSuccess(res, 200, "Products fetched successfully", result);
});
