const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { placeOrder } = require("../../services/orders");
const { validateCreateOrder } = require("../../validator/orders");

exports.create = asyncWrapper(async (req, res) => {
  const { error, value } = validateCreateOrder(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const userId = req.userId;
  const cart = await placeOrder(userId, value);
  return sendSuccess(res, 201, "Order Placed", cart);
});
