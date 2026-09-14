const { placeOrder } = require("./placeOrder");
const { previewOrder } = require("./previewOrder");
const { verifyPayment } = require("./verifyPayment");
const { getAllOrders } = require("./getAllOrders");
const { getOrder } = require("./getOrder");
const { updateOrder } = require("./updateOrder");
const { updateOrderStatus, cancelOrder } = require("./updateOrderStatus");
const { getVendorSummary, getAdminSummary } = require("./orderSummary");
const { assertOrderAccess, buildOrderScope } = require("./assertOrderAccess");
const {
  ALLOWED_TRANSITIONS,
  allowedNextStatuses,
  canTransition,
} = require("./orderStateMachine");

module.exports = {
  placeOrder,
  previewOrder,
  verifyPayment,
  getAllOrders,
  getOrder,
  updateOrder,
  updateOrderStatus,
  cancelOrder,
  getVendorSummary,
  getAdminSummary,
  assertOrderAccess,
  buildOrderScope,
  ALLOWED_TRANSITIONS,
  allowedNextStatuses,
  canTransition,
};
