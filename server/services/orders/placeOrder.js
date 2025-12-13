const Razorpay = require("razorpay");
const mongoose = require("mongoose");
const Cart = require("../../models/Cart");
const Order = require("../../models/Order");
const Transaction = require("../../models/Transaction");
const ProductLocation = require("../../models/ProductLocation");
const { throwError } = require("../../utils");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});

exports.placeOrder = async (userId, payload) => {
  const { paymentMethod } = payload;
  const cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  });
  if (!cart || !cart.items.length) {
    throwError(400, "Cart is empty");
  }
  const order = await Order.create({
    userId,
    items: cart.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      price: i.priceSnapshot,
    })),
    subTotal: cart.subTotal,
    payableAmount: cart.subTotal,
    paymentMethod,
    paymentStatus: paymentMethod === "ONLINE" ? "INITIATED" : "NOT_REQUIRED",
  });

  // ---------------- ONLINE PAYMENT ----------------
  if (paymentMethod === "ONLINE") {
    const rpOrder = await razorpay.orders.create({
      amount: order.payableAmount * 100,
      currency: "INR",
      receipt: `order_${order._id}`,
    });

    order.razorpayOrderId = rpOrder.id;
    await order.save();

    await Transaction.create({
      orderId: order._id,
      gateway: "RAZORPAY",
      razorpayOrderId: rpOrder.id,
      amount: order.payableAmount,
    });

    return {
      type: "ONLINE",
      orderId: order._id,
      razorpayOrderId: rpOrder.id,
      amount: order.payableAmount,
      key: process.env.RAZORPAY_KEY,
    };
  }

  // ---------------- COD ----------------
  if (paymentMethod === "COD") {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
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
          throwError(400, "Stock unavailable for COD");
        }
      }
      order.status = "CONFIRMED";
      await order.save({ session });
      await Cart.updateOne(
        { userId, isPurchased: false },
        { isPurchased: true },
        { session }
      );
      await session.commitTransaction();
      session.endSession();
      return {
        type: "COD",
        orderId: order._id,
        message: "Order placed successfully with Cash on Delivery",
      };
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  }
};
