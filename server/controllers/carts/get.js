const { asyncWrapper, sendSuccess } = require("../../utils");
const { getCart } = require("../../services/carts");

exports.get = asyncWrapper(async (req, res) => {
  const userId = req.query?.userId || req.userId;
  const cart = await getCart(userId);
  return sendSuccess(res, 200, "Cart fetched", cart);
});
