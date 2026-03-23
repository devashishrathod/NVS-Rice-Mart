const express = require("express");
const router = express.Router();

const { isAdmin, verifyJwtToken } = require("../middlewares");
const {
  create,
  verify,
  getAll,
  get,
  update,
} = require("../controllers/orders");

router.post("/create", verifyJwtToken, create);
router.post("/verify-payment", verifyJwtToken, verify);
router.get("/getAll", verifyJwtToken, getAll);
router.get("/get/:id", verifyJwtToken, get);
router.put("/update/:id", isAdmin, update);

module.exports = router;
