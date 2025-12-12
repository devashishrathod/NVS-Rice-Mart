const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const { calculateCartTotal } = require("../../helpers/carts");
const { validateObjectId, throwError } = require("../../utils");

exports.addOrUpdateItem = async (userId, payload) => {
  let { productId, quantity } = payload;
  validateObjectId(productId, "Product Id");
  quantity = Number(quantity) || 1;
  const product = await Product.findById(productId);
  if (!product || product?.isDeleted) throwError(404, "Product not found");
  if (product?.stockQuantity === 0 || product?.isOutOfStock) {
    throwError(400, "Sorry, out of stock");
  }
  if (quantity > product?.stockQuantity) {
    throwError(400, `Only ${product.stockQuantity} stock is remaining`);
  }
  let updatedProduct;
  let cart = await Cart.findOne({ userId, isPurchased: false });
  if (!cart) {
    cart = await Cart.create({ userId, items: [{ productId, quantity }] });
    product.stockQuantity -= quantity;
    updatedProduct = await product.save();
  } else {
    if (cart.isDeleted) cart.isDeleted = false;
    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId
    );
    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity;
      product.stockQuantity -= quantity;
      updatedProduct = await product.save();
      if (cart.items[itemIndex].quantity <= 0) {
        cart.items.splice(itemIndex, 1);
        product.stockQuantity += quantity;
        updatedProduct = await product.save();
        if (
          updatedProduct &&
          updatedProduct?.stockQuantity > 0 &&
          updatedProduct?.isOutOfStock
        ) {
          product.isOutOfStock = false;
          updatedProduct = await product.save();
        }
      }
    } else {
      cart.items.push({ productId, quantity });
      product.stockQuantity -= quantity;
      updatedProduct = await product.save();
    }
  }
  if (updatedProduct && updatedProduct?.stockQuantity <= 0) {
    product.isOutOfStock = true;
    await product.save();
  }
  const productIds = cart.items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } });
  const productsMap = {};
  products.forEach((p) => (productsMap[p._id] = p));
  cart.subTotal = calculateCartTotal(cart.items, productsMap);
  return await cart.save();
};
