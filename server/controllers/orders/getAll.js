const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { getAllOrders } = require("../../services/orders");
const { validateGetAllOrdersQuery } = require("../../validator/orders");

exports.getAll = asyncWrapper(async (req, res) => {
  const { error } = validateGetAllOrdersQuery(req.query);
  if (error) throwError(422, cleanJoiError(error));
  const result = await getAllOrders(req.query);
  return sendSuccess(res, 200, "Orders fetched successfully", result);
});
