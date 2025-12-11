const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const {
  validateRemoveProductLocations,
} = require("../../validator/productLocations");
const { removeLocations } = require("../../services/productLocations");

exports.removeProductLocations = asyncWrapper(async (req, res) => {
  const productId = req.params?.productId;
  const { error, value } = validateRemoveProductLocations(req.body);
  if (error) throwError(422, cleanJoiError(error));
  await removeLocations(productId, value);
  return sendSuccess(res, 200, "Locations removed from product");
});
