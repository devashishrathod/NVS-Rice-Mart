const { placeOrder } = require("./placeOrder");
const { verifyPayment } = require("./verifyPayment");
const { getAllOrders } = require("./getAllOrders");
const { getOrder } = require("./getOrder");
const { updateOrder } = require("./updateOrder");

module.exports = {
  placeOrder,
  verifyPayment,
  getAllOrders,
  getOrder,
  updateOrder,
};
