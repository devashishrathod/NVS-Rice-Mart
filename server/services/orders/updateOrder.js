const Order = require("../../models/Order");
const { throwError, validateObjectId } = require("../../utils");
const { getOrder } = require("./getOrder");

// Sirf ye fields update ho sakti hain. Pehle payload ka har key blindly
// `order.set()` ho jata tha — matlab client `payableAmount`, `subTotal`,
// `paymentStatus` kuch bhi badal sakta tha.
const UPDATABLE_FIELDS = ["status", "paymentStatus"];

exports.updateOrder = async (id, payload) => {
  validateObjectId(id, "Order Id");
  const order = await Order.findById(id);
  if (!order) throwError(404, "Order not found");

  let changed = false;
  if (payload && typeof payload === "object") {
    for (const key of UPDATABLE_FIELDS) {
      if (payload[key] !== undefined) {
        order.set(key, payload[key]);
        changed = true;
      }
    }
  }
  if (!changed) throwError(422, "At least one valid field is required");

  await order.save();
  return await getOrder(id);
};
