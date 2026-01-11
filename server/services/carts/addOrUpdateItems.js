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
          priceSnapshot: product.generalPrice,
        },
      ],
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
      });
    }
    cart.items = validItems;
    const index = cart.items.findIndex(
      (i) => i.productId.toString() === productId
    );
    if (index > -1) {
      cart.items[index].quantity += quantity;
    } else {
      cart.items.push({
        productId,
        quantity,
        priceSnapshot: product.generalPrice,
      });
    }
  }
  cart.subTotal = cart.items.reduce((sum, item) => {
    const price = Number(item.priceSnapshot) || 0;
    const qty = Number(item.quantity) || 0;
    return sum + price * qty;
  }, 0);
  return await cart.save();
};
