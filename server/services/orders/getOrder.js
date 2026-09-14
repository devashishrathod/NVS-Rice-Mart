const Order = require("../../models/Order");
const { throwError, validateObjectId } = require("../../utils");
const { buildOrderPipeline, toObjectId } = require("./orderAggregation");
const { assertOrderAccess } = require("./assertOrderAccess");

/**
 * @param {string} id order id
 * @param {{ userId: any, role: string }} [actor] logged-in user. Pass karo to
 *        ownership check lagega. Internal calls (jaise updateOrder ka
 *        re-fetch) bina actor ke call kar sakte hain.
 */
exports.getOrder = async (id, actor) => {
  validateObjectId(id, "Order Id");
  const oid = toObjectId(id);
  const pipeline = buildOrderPipeline({ match: { _id: oid } });

  const result = await Order.aggregate(pipeline);
  const order = result?.[0];
  if (!order) throwError(404, "Order not found");
  if (actor) assertOrderAccess(order, actor);
  return order;
};
