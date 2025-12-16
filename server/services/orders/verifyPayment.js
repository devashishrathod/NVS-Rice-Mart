const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../../models/Order");
const Transaction = require("../../models/Transaction");
const ProductLocation = require("../../models/ProductLocation");
const Cart = require("../../models/Cart");
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
    // 🔒 lock stock AFTER payment
    for (const item of order.items) {
      const updated = await ProductLocation.updateOne(
        {
          productId: item.productId,
          stockQuantity: { $gte: item.quantity },
        },
        { $inc: { stockQuantity: -item.quantity } },
        { session }
      );

      if (!updated.modifiedCount) {
        throwError(400, "Stock unavailable");
      }
    }

    order.status = "PAID";
    order.paymentStatus = "SUCCESS";
    await order.save({ session });

    await Transaction.updateOne(
      { razorpayOrderId: razorpay_order_id },
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature,
        status: "SUCCESS",
      },
      { session }
    );

    await Cart.updateOne(
      { userId: order.userId, isPurchased: false },
      { isPurchased: true },
      { session }
    );

    await session.commitTransaction();
    session.endSession();
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};
