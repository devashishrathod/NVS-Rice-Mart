const Cart = require("../../models/Cart");
const Location = require("../../models/Location");
const ProductLocation = require("../../models/ProductLocation");
const { throwError } = require("../../utils");

exports.verifyCartByPincode = async (userId, payload) => {
  const { zipcode } = payload;
  const cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  }).populate("items.productId");
  if (!cart || cart.items.length === 0) {
    throwError(400, "Cart is empty or not found");
  }
  const locations = await Location.find({
    zipcode,
    isActive: true,
    isDeleted: false,
  }).select("_id");
  if (!locations.length) {
    throwError(400, "Delivery not available for this zipcode");
  }
  const locationIds = locations.map((l) => l._id);
  const productIds = cart.items.map((i) => i.productId._id);
  const productLocations = await ProductLocation.find({
    productId: { $in: productIds },
    locationId: { $in: locationIds },
    isActive: true,
    isDeleted: false,
  });
  const plMap = {};
  productLocations.forEach((pl) => {
    plMap[pl.productId.toString()] = pl;
  });
  const unavailableItems = [];
  const priceChanged = [];
  let newSubTotal = 0;
  for (const item of cart.items) {
    const pl = plMap[item.productId._id.toString()];
    if (!pl) {
      unavailableItems.push({
        productId: item.productId._id,
        reason: "Not deliverable to this zipcode",
      });
      continue;
    }
    if (item.quantity > pl.stockQuantity) {
      unavailableItems.push({
        productId: item.productId._id,
        reason: `Only ${pl.stockQuantity} available`,
      });
      continue;
    }
    if (item.priceSnapshot !== pl.price) {
      priceChanged.push({
        productId: item.productId._id,
        oldPrice: item.priceSnapshot,
        newPrice: pl.price,
      });
      item.priceSnapshot = pl.price;
    }
    item.resolvedPincode = zipcode;
    newSubTotal += pl.price * item.quantity;
  }
  if (unavailableItems.length) {
    return {
      status: "FAILED",
      unavailableItems,
    };
  }
  cart.subTotal = newSubTotal;
  await cart.save();
  if (priceChanged.length) {
    return {
      status: "PRICE_CHANGED",
      priceChanged,
      subTotal: newSubTotal,
    };
  }
  return {
    status: "OK",
    subTotal: newSubTotal,
  };
};
