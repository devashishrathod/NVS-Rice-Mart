const express = require("express");
const router = express.Router();

const { isUser, attachServiceContext } = require("../middlewares");

const {
  addOrUpdate,
  removeFromCart,
  get,
  clearCart,
  verifyByPincode,
} = require("../controllers/carts");

// Cart sirf customer ka hota hai — isUser (pehle koi bhi role kar sakta tha).
// add pe attachServiceContext isliye ki apne area ke vendor ka hi product
// add ho (listing already filter karti hai, ye defence in depth hai).
router.post("/add-or-update", isUser, attachServiceContext, addOrUpdate);
router.put("/remove/:productId", isUser, removeFromCart);
router.get("/get", isUser, get);
router.delete("/clear", isUser, clearCart);
router.post("/verify-delivery", isUser, verifyByPincode);

module.exports = router;
