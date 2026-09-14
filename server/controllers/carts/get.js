const { asyncWrapper, sendSuccess } = require("../../utils");
const { getCart } = require("../../services/carts");

exports.get = asyncWrapper(async (req, res) => {
  // 🔒 `?userId=` support hata diya — pehle koi bhi logged-in user kisi ka
  // bhi cart padh sakta tha.
  const cart = await getCart(req.userId);
  return sendSuccess(res, 200, "Cart fetched", cart);
});
