const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { verifyPayment } = require("../../services/orders");
const { validateVerifyOrderPayment } = require("../../validator/orders");

exports.verify = asyncWrapper(async (req, res) => {
  const { error, value } = validateVerifyOrderPayment(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const userId = req.userId;
  const cart = await verifyPayment(userId, value);
  return sendSuccess(res, 201, "Payment verified! Order Placed", cart);
});
