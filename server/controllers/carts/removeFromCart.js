const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { removeItem } = require("../../services/carts");
const { validateRemoveFromCart } = require("../../validator/carts");

exports.removeFromCart = asyncWrapper(async (req, res) => {
  const { error, value } = validateRemoveFromCart(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const userId = req.userId;
  const { productId } = req.params;
  const cart = await removeItem(userId, productId, value);
  return sendSuccess(res, 200, "Product removed from cart", cart);
});
