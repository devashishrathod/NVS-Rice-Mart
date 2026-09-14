const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../../models/Order");
const Transaction = require("../../models/Transaction");
const Product = require("../../models/Product");
const Cart = require("../../models/Cart");
const { notifyOrderPlaced } = require("../../helpers/notifications");
const { ORDER_STATUS, PAYMENT_STATUS, ERROR_CODES } = require("../../constants");
const { throwError } = require("../../utils");

exports.verifyPayment = async (payload) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    payload;

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    throwError(400, "Invalid payment signature");
  }

  const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
  if (!order) throwError(404, "Order not found");

  if (order.paymentStatus === "SUCCESS") return;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 🔒 Payment ke BAAD stock reserve. Stock ka single source `Product`
    //    hai (D3) — pehle `ProductLocation` pe hota tha, aur `locationId`
    //    filter ke bina kisi bhi random row ka stock ghata deta tha.
    for (const item of order.items) {
      const updated = await Product.updateOne(
        {
          _id: item.productId,
          userId: order.vendorId,
          isDeleted: false,
          stockQuantity: { $gte: item.quantity },
        },
        { $inc: { stockQuantity: -item.quantity } },
        { session },
      );

      if (!updated.modifiedCount) {
        throwError(
          409,
          `${item.productSnapshot?.name || "An item"} is out of stock`,
          ERROR_CODES.STOCK_UNAVAILABLE,
        );
      }
    }

    // ⚠️ Pehle yahan `status = "PAID"` tha jo ORDER_STATUS enum me hai hi
    // nahi — payment ke baad save ValidationError deta tha, transaction
    // abort hota tha, aur customer ka paisa kat jane ke baad bhi order
    // nahi banta tha.
    order.status = ORDER_STATUS.PENDING;
    order.paymentStatus = PAYMENT_STATUS.SUCCESS;
    await order.save({ session });

    await Transaction.updateOne(
      { razorpayOrderId: razorpay_order_id },
      {
        razorpayPaymentId: razorpay_payment_id,
        // ⚠️ Pehle yahan `razorpaySignature` (undefined variable) tha —
        // ReferenceError. Sahi naam `razorpay_signature` hai.
        razorpaySignature: razorpay_signature,
        status: "SUCCESS",
      },
      { session },
    );

    await Cart.updateOne(
      { userId: order.userId, isPurchased: false },
      { isPurchased: true },
      { session },
    );

    await session.commitTransaction();
    // Notification transaction ke BAAHAR aur non-blocking — pehle ye
    // `await` tha aur throw kar sakta tha, matlab payment verify hone ke
    // baad bhi API error de deti thi.
    notifyOrderPlaced(order).catch((e) =>
      console.error("Order notification failed:", e?.message),
    );
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
