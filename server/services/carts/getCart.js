const Cart = require("../../models/Cart");
const { throwError } = require("../../utils");

exports.getCart = async (userId) => {
  const cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  }); // .populate("items.productId");
  if (!cart) throwError(404, "Cart is empty or not found");
  return cart;
};
