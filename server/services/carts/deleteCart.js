const Cart = require("../../models/Cart");
const { throwError } = require("../../utils");

exports.deleteCart = async (userId) => {
  const cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  });
  if (!cart) throwError(404, "Cart is empty or not found");
  cart.isDeleted = true;
  cart.items = [];
  cart.vendorId = undefined;
  cart.subTotal = 0;
  cart.totalWeight = 0;
  cart.totalQuantity = 0;
  cart.verifiedAt = null;
  cart.deliveryZipcode = undefined;
  await cart.save();
  return;
};
