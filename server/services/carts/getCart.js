const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const { throwError } = require("../../utils");

exports.getCart = async (userId) => {
  let cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  });
  if (!cart || !cart.items.length) {
    throwError(404, "Your cart is empty");
  }
  let cartUpdated = false;
  const validItems = [];
  for (const item of cart.items) {
    const product = await Product.findOne({
      _id: item.productId,
      isDeleted: false,
      isActive: true,
    });
    if (!product) {
      cartUpdated = true;
      continue;
    }
    if (product.isOutOfStock || product.stockQuantity <= 0) {
      cartUpdated = true;
      continue;
    }
    let quantity = item.quantity;
    if (quantity > product.stockQuantity) {
      quantity = product.stockQuantity;
      cartUpdated = true;
    }
    validItems.push({
      ...item.toObject(),
      quantity,
      priceSnapshot: Number(product.generalPrice) || 0,
    });
  }
  if (!validItems.length) {
    cart.items = [];
    cart.subTotal = 0;
    cart.isDeleted = true;
    await cart.save();
    throwError(
      404,
      "All items in your cart are no longer available or out of stock"
    );
  }
  cart.items = validItems;
  cart.subTotal = validItems.reduce((sum, item) => {
    return sum + item.priceSnapshot * item.quantity;
  }, 0);
  if (cartUpdated) await cart.save();
  return cart;
};
