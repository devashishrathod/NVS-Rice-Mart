const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const {
  validateAddProductLocations,
} = require("../../validator/productLocations");
const { addOrUpdateLocations } = require("../../services/productLocations");

exports.addProductLocations = asyncWrapper(async (req, res) => {
  const productId = req.params?.productId;
  const { error, value } = validateAddProductLocations(req.body);
  if (error) throwError(422, cleanJoiError(error));
  await addOrUpdateLocations(productId, value);
  return sendSuccess(res, 200, "Locations added/updated for product");
});
