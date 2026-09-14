const mongoose = require("mongoose");
const Cart = require("../../models/Cart");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const {
  ORDER_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  ERROR_CODES,
} = require("../../constants");
const { throwError, validateObjectId } = require("../../utils");
const {
  computeOrderPricing,
} = require("../../helpers/orders/computeOrderPricing");
const {
  generateOrderNumber,
} = require("../../helpers/orders/generateOrderNumber");
const { notifyOrderPlaced } = require("../../helpers/notifications");

/**
 * COD-only order placement.
 *
 * Pricing `computeOrderPricing` se aati hai (wahi jo `/orders/preview` use
 * karta hai). Stock sirf yahan reserve hota hai — cart kabhi stock nahi
 * chhuti.
 */
exports.placeOrder = async (userId, payload) => {
  const { locationId, paymentMethod } = payload;
  validateObjectId(locationId, "Location Id");

  if (paymentMethod !== PAYMENT_METHODS.COD) {
    throwError(422, "Only Cash on Delivery (COD) is available right now");
  }

  const cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  }).lean();
  if (!cart || !cart.items?.length) throwError(400, "Cart is empty");

  // Cart verify hua hai aur usi address ke liye hua hai?
  if (!cart.verifiedAt) {
    throwError(
      400,
      "Please verify delivery for your cart before placing the order",
      ERROR_CODES.CART_NOT_VERIFIED,
    );
  }

  const pricing = await computeOrderPricing({ userId, cart, locationId });

  if (
    cart.deliveryZipcode &&
    cart.deliveryZipcode !== pricing.userLocation.zipcode
  ) {
    throwError(
      400,
      "Your cart was verified for a different address — please verify again",
      ERROR_CODES.CART_NOT_VERIFIED,
      {
        verifiedFor: cart.deliveryZipcode,
        selected: pricing.userLocation.zipcode,
      },
    );
  }

  // Order number transaction ke BAAHAR — `counters` collection pehli baar
  // banani pad sakti hai, aur transaction ke andar implicit collection
  // creation har Mongo version pe allowed nahi hai. Transaction fail hone
  // par ek number skip ho jayega, jo bilkul acceptable hai.
  const orderNumber = await generateOrderNumber();

  const session = await mongoose.startSession();
  session.startTransaction();
  let order;
  try {
    // ── Stock reserve — guarded $inc, race-safe ────────────
    for (const item of pricing.items) {
      const r = await Product.updateOne(
        {
          _id: item.productId,
          userId: cart.vendorId,
          isDeleted: false,
          stockQuantity: { $gte: item.quantity },
        },
        { $inc: { stockQuantity: -item.quantity } },
        { session },
      );
      if (!r.modifiedCount) {
        throwError(
          409,
          `${item.productSnapshot?.name || "An item"} is out of stock`,
          ERROR_CODES.STOCK_UNAVAILABLE,
          { productId: item.productId },
        );
      }
    }

    [order] = await Order.create(
      [
        {
          userId,
          vendorId: cart.vendorId,
          vendorLocationId: pricing.pickup._id,
          cartId: cart._id,
          locationId,
          orderNumber,
          items: pricing.items,
          distanceKm: pricing.distanceKm,
          deliveryCharge: pricing.deliveryCharge,
          subTotal: pricing.subTotal,
          payableAmount: pricing.payableAmount,
          deliveryPincode: pricing.userLocation.zipcode,
          paymentMethod: PAYMENT_METHODS.COD,
          paymentStatus: PAYMENT_STATUS.NOT_REQUIRED,
          // COD me INITIATED ka koi matlab nahi — seedha vendor ke paas
          status: ORDER_STATUS.PENDING,
          statusHistory: [
            {
              status: ORDER_STATUS.PENDING,
              changedBy: userId,
              changedByRole: "user",
              at: new Date(),
            },
          ],
        },
      ],
      { session },
    );

    await Cart.updateOne(
      { _id: cart._id },
      { $set: { isPurchased: true, verifiedAt: null } },
      { session },
    );

    await session.commitTransaction();
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  // Notifications transaction ke BAAHAR — kabhi order fail na karein
  notifyOrderPlaced(order).catch((e) =>
    console.error("Order notification failed:", e?.message),
  );

  return {
    type: PAYMENT_METHODS.COD,
    orderId: order._id,
    orderNumber: order.orderNumber,
    subTotal: order.subTotal,
    deliveryCharge: order.deliveryCharge,
    payableAmount: order.payableAmount,
    status: order.status,
    message: "Order placed successfully with Cash on Delivery",
  };
};
