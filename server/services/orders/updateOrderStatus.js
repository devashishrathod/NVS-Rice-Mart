const mongoose = require("mongoose");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const { ORDER_STATUS, ROLES, ERROR_CODES } = require("../../constants");
const { throwError, validateObjectId } = require("../../utils");
const { notifyOrderStatusChanged } = require("../../helpers/notifications");
const {
  canTransition,
  allowedNextStatuses,
  RESTOCK_STATUSES,
  roleKey,
} = require("./orderStateMachine");
const { getOrder } = require("./getOrder");

/**
 * Status change — state machine + ownership + stock restore, sab ek jagah.
 *
 * @param {{ userId: any, role: string }} actor
 */
exports.updateOrderStatus = async (orderId, payload, actor) => {
  validateObjectId(orderId, "Order Id");
  const { status: nextStatus, note, reason } = payload;

  const order = await Order.findById(orderId);
  if (!order) throwError(404, "Order not found");

  // ── Ownership ────────────────────────────────────────────
  if (actor.role === ROLES.VENDOR) {
    if (String(order.vendorId ?? "") !== String(actor.userId)) {
      throwError(404, "Order not found", ERROR_CODES.FORBIDDEN);
    }
  } else if (actor.role === ROLES.USER) {
    if (String(order.userId ?? "") !== String(actor.userId)) {
      throwError(404, "Order not found", ERROR_CODES.FORBIDDEN);
    }
  } else {
    // 🔒 D6 — admin read-only
    throwError(
      403,
      "Forbidden: only the vendor can update this order",
      ERROR_CODES.FORBIDDEN,
    );
  }

  // ── State machine ────────────────────────────────────────
  if (order.status === nextStatus) {
    throwError(
      422,
      `Order is already ${nextStatus}`,
      ERROR_CODES.INVALID_STATUS_TRANSITION,
      { from: order.status, allowed: allowedNextStatuses(order.status, actor.role) },
    );
  }
  if (!canTransition(order.status, nextStatus, actor.role)) {
    throwError(
      422,
      `Cannot move order from ${order.status} to ${nextStatus}`,
      ERROR_CODES.INVALID_STATUS_TRANSITION,
      { from: order.status, allowed: allowedNextStatuses(order.status, actor.role) },
    );
  }

  const cancelReason = reason || note;
  if (nextStatus === ORDER_STATUS.REJECTED && !cancelReason) {
    throwError(422, "A reason is required when rejecting an order");
  }

  const shouldRestock = RESTOCK_STATUSES.has(nextStatus);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (shouldRestock) {
      // Stock wapas — cancel/reject pe hamesha
      for (const item of order.items) {
        await Product.updateOne(
          { _id: item.productId },
          { $inc: { stockQuantity: item.quantity } },
          { session },
        );
      }
    }

    order.status = nextStatus;
    if (cancelReason) order.cancelReason = cancelReason;
    if (nextStatus === ORDER_STATUS.DELIVERED) order.deliveredAt = new Date();
    order.statusHistory.push({
      status: nextStatus,
      changedBy: actor.userId,
      changedByRole: roleKey(actor.role),
      note: note || reason,
      at: new Date(),
    });
    await order.save({ session });

    await session.commitTransaction();
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  notifyOrderStatusChanged(order, roleKey(actor.role)).catch((e) =>
    console.error("Status notification failed:", e?.message),
  );

  return await getOrder(orderId);
};

/**
 * Customer cancel — internally wahi state machine use karta hai, bas
 * status fix hai.
 */
exports.cancelOrder = async (orderId, payload, actor) =>
  exports.updateOrderStatus(
    orderId,
    { status: ORDER_STATUS.CANCELLED, reason: payload?.reason },
    actor,
  );
