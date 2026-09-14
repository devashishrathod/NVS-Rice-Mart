const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const {
  updateOrderStatus,
  cancelOrder,
  getVendorSummary,
  getAdminSummary,
} = require("../../services/orders");
const {
  validateUpdateOrderStatus,
  validateCancelOrder,
} = require("../../validator/orders");

/** Vendor: PENDING → ACCEPTED → PACKED → OUT_FOR_DELIVERY → DELIVERED */
exports.updateStatus = asyncWrapper(async (req, res) => {
  const { error, value } = validateUpdateOrderStatus(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const result = await updateOrderStatus(req.params?.id, value, {
    userId: req.userId,
    role: req.role,
  });
  return sendSuccess(res, 200, "Order status updated", result);
});

/** Customer: sirf PENDING / ACCEPTED tak */
exports.cancel = asyncWrapper(async (req, res) => {
  const { error, value } = validateCancelOrder(req.body || {});
  if (error) throwError(422, cleanJoiError(error));
  const result = await cancelOrder(req.params?.id, value, {
    userId: req.userId,
    role: req.role,
  });
  return sendSuccess(res, 200, "Order cancelled", result);
});

exports.vendorSummary = asyncWrapper(async (req, res) => {
  const result = await getVendorSummary(req.userId);
  return sendSuccess(res, 200, "Vendor summary fetched", result);
});

exports.adminSummary = asyncWrapper(async (req, res) => {
  const result = await getAdminSummary({ userId: req.userId, role: req.role });
  return sendSuccess(res, 200, "Admin summary fetched", result);
});
