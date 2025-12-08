const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { addOrUpdateItem } = require("../../services/carts");
const { validateAddOrUpdateCart } = require("../../validator/carts");

exports.addOrUpdate = asyncWrapper(async (req, res) => {
  const { error, value } = validateAddOrUpdateCart(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const userId = req.userId;
  const cart = await addOrUpdateItem(userId, value);
  return sendSuccess(res, 201, "Cart updated", cart);
});
