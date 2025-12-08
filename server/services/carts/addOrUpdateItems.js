const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const { calculateCartTotal } = require("../../helpers/carts");
const { validateObjectId } = require("../../utils");

exports.addOrUpdateItem = async (userId, payload) => {
  let { productId, quantity } = payload;
  validateObjectId(productId, "Product Id");
  quantity = Number(quantity) || 1;
  let cart = await Cart.findOne({ userId, isPurchased: false });
  if (!cart) {
    cart = await Cart.create({ userId, items: [{ productId, quantity }] });
  } else {
    if (cart.isDeleted) cart.isDeleted = false;
    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId
    );
    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity;
      if (cart.items[itemIndex].quantity <= 0) {
        cart.items.splice(itemIndex, 1);
      }
    } else {
      cart.items.push({ productId, quantity });
    }
  }
  const productIds = cart.items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } });
  const productsMap = {};
  products.forEach((p) => (productsMap[p._id] = p));
  cart.subTotal = calculateCartTotal(cart.items, productsMap);
  return await cart.save();
};
