const { asyncWrapper, sendSuccess } = require("../../utils");
const { getOrder } = require("../../services/orders");

exports.get = asyncWrapper(async (req, res) => {
  const result = await getOrder(req.params?.id);
  return sendSuccess(res, 200, "Order fetched successfully", result);
});
