const Order = require("../../models/Order");
const { throwError, validateObjectId } = require("../../utils");
const { getOrder } = require("./getOrder");

exports.updateOrder = async (id, payload) => {
  validateObjectId(id, "Order Id");
  const order = await Order.findById(id);
  if (!order) throwError(404, "Order not found");

  if (payload && typeof payload === "object") {
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined) order.set(key, value);
    });
  }

  await order.save();
  return await getOrder(id);
};
