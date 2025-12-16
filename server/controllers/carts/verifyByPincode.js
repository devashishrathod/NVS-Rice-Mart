const {
  asyncWrapper,
  sendSuccess,
  throwError,
  sendError,
  cleanJoiError,
} = require("../../utils");
const { validateVerifyCart } = require("../../validator/carts");
const { verifyCartByPincode } = require("../../services/carts");

exports.verifyByPincode = asyncWrapper(async (req, res) => {
  const { error, value } = validateVerifyCart(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const userId = req.userId;
  const result = await verifyCartByPincode(userId, value);
  if (result.status === "FAILED") {
    return sendError(
      res,
      400,
      "Some items are not deliverable to this pincode",
      result
    );
  }
  if (result.status === "PRICE_CHANGED") {
    return sendSuccess(res, 200, "Prices updated based on pincode", result);
  }
  return sendSuccess(res, 200, "Cart verified successfully", result);
});
