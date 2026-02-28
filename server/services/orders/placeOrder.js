const Razorpay = require("razorpay");
const mongoose = require("mongoose");
const Setting = require("../../models/Setting");
const Cart = require("../../models/Cart");
const Order = require("../../models/Order");
const Transaction = require("../../models/Transaction");
const Location = require("../../models/Location");
const { SHOP_ADDRESS } = require("../../constants");
const ProductLocation = require("../../models/ProductLocation");
const { throwError, validateObjectId } = require("../../utils");
const {
  calculateDistanceInKm,
} = require("../../helpers/orders/calculateDistanceInKm");
const {
  calculateDeliveryCharges,
} = require("../../helpers/orders/calculateDeliveryCharges");
const { DELIVERY_SETTINGS } = require("../../constants");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});

exports.placeOrder = async (userId, payload) => {
  const { locationId, paymentMethod } = payload;
  validateObjectId(locationId, "Invalid location ID");
  const cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  });
  if (!cart || !cart.items.length) {
    throwError(400, "Cart is empty");
  }
  const setting = await Setting.findOne();
  // if (!setting || !setting.delivery || !setting.delivery.shopLocation) {
  //   throwError(500, "Delivery settings not configured");
  // }
  const shopLocationId = setting?.delivery?.shopLocationId;
  let shopLocation = null;
  if (shopLocationId) {
    shopLocation = await Location.findOne({
      _id: shopLocationId,
      isDeleted: false,
    });
  }
  // if (
  //   !shopLocation ||
  //   shopLocation.isDeleted ||
  //   shopLocation.coordinates.toString() === [0, 0].toString()
  // ) {
  //   throwError(500, "Shop location not configured");
  // }
  const shopLat =
    shopLocation &&
    shopLocation.coordinates[0] &&
    shopLocation.coordinates[0] !== 0
      ? shopLocation.coordinates[0]
      : SHOP_ADDRESS.LAT;
  const shopLng =
    shopLocation &&
    shopLocation.coordinates[1] &&
    shopLocation.coordinates[1] !== 0
      ? shopLocation.coordinates[1]
      : SHOP_ADDRESS.LNG;
  const userLocation = await Location.findById(locationId);
  if (
    !userLocation ||
    userLocation.isDeleted ||
    !userLocation.zipcode ||
    userLocation?.userId?.toString() !== userId?.toString() ||
    userLocation?.coordinates?.toString() === [0, 0].toString()
  ) {
    throwError(
      404,
      "Incorrect user location! Delivery user location not found",
    );
  }
  if (!cart?.items?.every((i) => i.resolvedPincode === userLocation.zipcode)) {
    throwError(400, "Pincode mismatch on verified cart items");
  }
  const totalDistance = calculateDistanceInKm(
    userLocation.coordinates[0],
    userLocation.coordinates[1],
    shopLat,
    shopLng,
  );
  console.log("Total distance for delivery:", totalDistance, "km");
  const deliverySetting = setting?.delivery || {};
  const maxRadiusKm =
    Number(deliverySetting?.maxRadiusKm) ?? DELIVERY_SETTINGS.MAX_RADIUS_KM;
  if (totalDistance > maxRadiusKm) {
    throwError(400, `Delivery not available beyond ${maxRadiusKm} km`);
  }
  const deliveryPrice = calculateDeliveryCharges(
    cart.totalWeight,
    totalDistance,
    deliverySetting,
  );
  const order = await Order.create({
    userId,
    cartId: cart._id,
    locationId,
    items: cart.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      price: i.priceSnapshot,
    })),
    distanceKm: totalDistance,
    deliveryCharge: deliveryPrice,
    subTotal: cart.subTotal,
    payableAmount: cart.subTotal + deliveryPrice,
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
          { session },
        );
        if (!updated.modifiedCount) {
          throwError(400, "Stock unavailable for COD");
        }
      }
      order.status = "PENDING";
      await order.save({ session });
      await Cart.updateOne(
        { userId, isPurchased: false },
        { isPurchased: true },
        { session },
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
