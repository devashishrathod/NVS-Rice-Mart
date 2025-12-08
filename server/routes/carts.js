const express = require("express");
const router = express.Router();

const { isAdmin, verifyJwtToken } = require("../middlewares");

const {
  addOrUpdate,
  removeFromCart,
  get,
  clearCart,
} = require("../controllers/carts");

router.post("/add-or-update", verifyJwtToken, addOrUpdate);
router.put("/remove/:productId", verifyJwtToken, removeFromCart);
router.get("/get", verifyJwtToken, get);
router.delete("/clear", verifyJwtToken, clearCart);

module.exports = router;
