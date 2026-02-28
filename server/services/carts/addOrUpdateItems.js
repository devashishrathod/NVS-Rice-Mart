const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const { validateObjectId, throwError } = require("../../utils");

exports.addOrUpdateItem = async (userId, payload) => {
  let { productId, quantity } = payload;
  validateObjectId(productId, "Product Id");
  quantity = Math.max(Number(quantity) || 1, 1);
  const product = await Product.findOne({
    _id: productId,
    isDeleted: false,
    isActive: true,
  });
  if (!product) throwError(404, "Product not found");
  if (product.isOutOfStock || product.stockQuantity <= 0) {
    throwError(400, "Product is out of stock");
  }
  let cart = await Cart.findOne({
    userId,
    isPurchased: false,
  });
  if (!cart) {
    cart = await Cart.create({
      userId,
      items: [
        {
          productId,
          quantity,
          productWeight: product.weightInKg,
          itemWeight: product.weightInKg * quantity,
          priceSnapshot: product.generalPrice,
        },
      ],
      totalWeight: product.weightInKg * quantity,
      totalQuantity: quantity,
    });
  } else {
    if (cart.isDeleted) cart.isDeleted = false;
    const validItems = [];
    for (const item of cart.items) {
      const existingProduct = await Product.findOne({
        _id: item.productId,
        isDeleted: false,
        isActive: true,
      });
      if (
        !existingProduct ||
        existingProduct.isOutOfStock ||
        existingProduct.stockQuantity <= 0
      ) {
        continue;
      }
      validItems.push({
        ...item.toObject(),
        priceSnapshot: existingProduct.generalPrice,
        productWeight: existingProduct.weightInKg,
        itemWeight: existingProduct.weightInKg * item.quantity,
      });
    }
    cart.items = validItems;
    if (validItems.length > 0) {
      cart.totalWeight = validItems.reduce((sum, item) => {
        const weight = Number(item.productWeight) || 0;
        const qty = Number(item.quantity) || 0;
        return sum + weight * qty;
      }, 0);
      cart.totalQuantity = validItems.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        return sum + qty;
      }, 0);
    }
    const index = cart.items.findIndex(
      (i) => i.productId.toString() === productId,
    );
    if (index > -1) {
      cart.items[index].quantity += quantity;
      cart.items[index].priceSnapshot = product.generalPrice;
      cart.items[index].productWeight = product.weightInKg;
      cart.items[index].itemWeight =
        cart.items[index].productWeight * cart.items[index].quantity;
      cart.totalWeight += product.weightInKg * quantity;
      cart.totalQuantity += quantity;
    } else {
      cart.items.push({
        productId,
        quantity,
        productWeight: product.weightInKg,
        itemWeight: product.weightInKg * quantity,
        priceSnapshot: product.generalPrice,
      });
      cart.totalWeight += product.weightInKg * quantity;
      cart.totalQuantity += quantity;
    }
  }
  cart.totalWeight = Math.max(cart.totalWeight, 0);
  cart.totalQuantity = Math.max(cart.totalQuantity, 0);
  cart.subTotal = cart.items.reduce((sum, item) => {
    const price = Number(item.priceSnapshot) || 0;
    const qty = Number(item.quantity) || 0;
    return sum + price * qty;
  }, 0);
  return await cart.save();
};
