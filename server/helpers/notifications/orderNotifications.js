const User = require("../../models/User");
const { ROLES, ORDER_STATUS } = require("../../constants");
const { sendNotification } = require("./sendNotification");

const adminIds = async () => {
  const admins = await User.find({ role: ROLES.ADMIN, isDeleted: false })
    .select("_id")
    .lean();
  return admins.map((a) => a._id);
};

const payload = (order) => ({
  orderId: String(order._id),
  orderNumber: order.orderNumber || "",
});

/**
 * Order place hone par — vendor ko sabse zaruri notification, kyunki
 * COD-only flow me yahi uska kaam shuru karta hai.
 */
exports.notifyOrderPlaced = async (order) => {
  const data = payload(order);
  await Promise.allSettled([
    sendNotification({
      toUserId: order.vendorId,
      title: "New order received",
      body: `Order ${order.orderNumber} · ₹${order.payableAmount}`,
      data,
    }),
    sendNotification({
      toUserId: order.userId,
      title: "Order placed",
      body: `Your order ${order.orderNumber} has been placed successfully`,
      data,
    }),
    ...(await adminIds()).map((id) =>
      sendNotification({
        toUserId: id,
        title: "New order",
        body: `Order ${order.orderNumber} · ₹${order.payableAmount}`,
        data,
      }),
    ),
  ]);
};

const CUSTOMER_MESSAGES = {
  [ORDER_STATUS.ACCEPTED]: (o) => ({
    title: "Order accepted",
    body: `${o.orderNumber} has been accepted and is being prepared`,
  }),
  [ORDER_STATUS.PACKED]: (o) => ({
    title: "Order packed",
    body: `${o.orderNumber} is packed and will be out for delivery soon`,
  }),
  [ORDER_STATUS.OUT_FOR_DELIVERY]: (o) => ({
    title: "Out for delivery",
    body: `${o.orderNumber} is on the way`,
  }),
  [ORDER_STATUS.DELIVERED]: (o) => ({
    title: "Order delivered",
    body: `${o.orderNumber} has been delivered. Thank you!`,
  }),
  [ORDER_STATUS.REJECTED]: (o) => ({
    title: "Order could not be accepted",
    body: o.cancelReason
      ? `${o.orderNumber}: ${o.cancelReason}`
      : `${o.orderNumber} was rejected by the shop`,
  }),
  [ORDER_STATUS.CANCELLED]: (o) => ({
    title: "Order cancelled",
    body: `${o.orderNumber} has been cancelled`,
  }),
};

/** Status change ke baad — kisko bhejna hai wo status decide karta hai. */
exports.notifyOrderStatusChanged = async (order, changedByRole) => {
  const data = payload(order);
  const tasks = [];

  const msg = CUSTOMER_MESSAGES[order.status]?.(order);
  // Customer ne khud cancel kiya to usko dobara batane ka matlab nahi
  const skipCustomer =
    order.status === ORDER_STATUS.CANCELLED && changedByRole === "user";
  if (msg && !skipCustomer) {
    tasks.push(sendNotification({ toUserId: order.userId, ...msg, data }));
  }

  // Vendor ko tab batao jab customer ne kuch kiya ho
  if (order.status === ORDER_STATUS.CANCELLED && changedByRole === "user") {
    tasks.push(
      sendNotification({
        toUserId: order.vendorId,
        title: "Order cancelled by customer",
        body: `${order.orderNumber} was cancelled${order.cancelReason ? `: ${order.cancelReason}` : ""}`,
        data,
      }),
    );
  }
  if (order.status === ORDER_STATUS.DELIVERED) {
    tasks.push(
      sendNotification({
        toUserId: order.vendorId,
        title: "Order delivered",
        body: `${order.orderNumber} marked as delivered`,
        data,
      }),
    );
  }
  // Reject admin ko bhi pata hona chahiye
  if (order.status === ORDER_STATUS.REJECTED) {
    const ids = await adminIds();
    ids.forEach((id) =>
      tasks.push(
        sendNotification({
          toUserId: id,
          title: "Order rejected by vendor",
          body: `${order.orderNumber}${order.cancelReason ? `: ${order.cancelReason}` : ""}`,
          data,
        }),
      ),
    );
  }

  await Promise.allSettled(tasks);
};
