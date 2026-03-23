const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { updateOrder } = require("../../services/orders");
const { validateUpdateOrder } = require("../../validator/orders");

exports.update = asyncWrapper(async (req, res) => {
  const { error, value } = validateUpdateOrder(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const result = await updateOrder(req.params?.id, value);
  return sendSuccess(res, 200, "Order updated successfully", result);
});
