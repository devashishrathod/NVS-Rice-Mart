const Cart = require("../../models/Cart");
const { throwError, validateObjectId } = require("../../utils");
const { computeOrderPricing } = require("../../helpers/orders/computeOrderPricing");

/**
 * Checkout screen ke liye read-only pricing.
 * `placeOrder` bilkul yahi calculation karta hai, isliye total kabhi
 * mismatch nahi hoga.
 */
exports.previewOrder = async (userId, payload) => {
  const { locationId } = payload;
  validateObjectId(locationId, "Location Id");

  const cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  }).lean();
  if (!cart || !cart.items?.length) throwError(400, "Cart is empty");

  const pricing = await computeOrderPricing({ userId, cart, locationId });

  return {
    subTotal: pricing.subTotal,
    deliveryCharge: pricing.deliveryCharge,
    payableAmount: pricing.payableAmount,
    distanceKm: pricing.distanceKm,
    totalWeight: pricing.totalWeight,
    totalQuantity: cart.items.reduce((s, i) => s + (i.quantity || 0), 0),
    freeDeliveryAbove: pricing.freeDeliveryAbove,
    freeDeliveryApplied: pricing.freeDeliveryApplied,
    minOrderAmount: pricing.minOrderAmount,
    etaMinutes: pricing.etaMinutes,
    deliveryPincode: pricing.userLocation.zipcode,
    vendor: pricing.vendor,
    paymentMethods: ["COD"], // online abhi disabled hai
  };
};
