const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const { calculateCartTotal } = require("../../helpers/carts");
const { validateObjectId, throwError } = require("../../utils");

exports.removeItem = async (userId, productId, payload) => {
  const { action } = payload;
  validateObjectId(productId, "Product Id");
  const product = await Product.findById(productId);
  if (!product) throwError(404, "Product not found"); // || product?.isDeleted
  const cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  });
  if (!cart) throwError(404, "Cart not found");
  const itemIndex = cart.items.findIndex(
    (i) => i.productId.toString() === productId
  );
  if (itemIndex === -1) throwError(404, "Product not found in cart");
  let updatedProduct;
  if (action === "remove") {
    const productQuantity = cart.items[itemIndex].quantity;
    cart.items.splice(itemIndex, 1);
    product.stockQuantity += productQuantity;
    updatedProduct = await product.save();
  } else if (action === "decrease") {
    cart.items[itemIndex].quantity -= 1;
    product.stockQuantity += 1;
    updatedProduct = await product.save();
    if (cart.items[itemIndex].quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    }
  } else {
    throwError(422, "Invalid action on cart");
  }
  if (updatedProduct && updatedProduct?.stockQuantity > 0) {
    product.isOutOfStock = false;
    await product.save();
  }
  if (cart.items.length === 0) {
    cart.subTotal = 0;
    cart.isDeleted = true;
    await cart.save();
    throwError(200, "Your cart is now empty");
  }
  const productIds = cart.items.map((i) => i.productId);
  const products = await Product.find(
    { _id: { $in: productIds } },
    { generalPrice: 1 }
  );
  const productsMap = {};
  products.forEach((p) => {
    productsMap[p._id.toString()] = p;
  });
  cart.subTotal = calculateCartTotal(cart.items, productsMap);
  return await cart.save();
};
