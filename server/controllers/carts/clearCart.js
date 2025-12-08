const { asyncWrapper, sendSuccess } = require("../../utils");
const { deleteCart } = require("../../services/carts");

exports.clearCart = asyncWrapper(async (req, res) => {
  const userId = req.userId;
  await deleteCart(userId);
  return sendSuccess(res, 200, "Cart cleared");
});
