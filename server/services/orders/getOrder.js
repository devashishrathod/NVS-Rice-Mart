const Order = require("../../models/Order");
const { throwError, validateObjectId } = require("../../utils");
const { buildOrderPipeline } = require("./orderAggregation");
const { toObjectId } = require("./orderAggregation");

exports.getOrder = async (id) => {
  validateObjectId(id, "Order Id");
  const oid = toObjectId(id);
  const pipeline = buildOrderPipeline({ match: { _id: oid } });

  const result = await Order.aggregate(pipeline);
  const order = result && result[0];
  if (!order) throwError(404, "Order not found");
  return order;
};
