const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { previewOrder } = require("../../services/orders");
const { validateOrderPreview } = require("../../validator/orders");

exports.preview = asyncWrapper(async (req, res) => {
  const { error, value } = validateOrderPreview(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const result = await previewOrder(req.userId, value);
  return sendSuccess(res, 200, "Order preview", result);
});
