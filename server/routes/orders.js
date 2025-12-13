const express = require("express");
const router = express.Router();

const { isAdmin, verifyJwtToken } = require("../middlewares");
const { create, verify } = require("../controllers/orders");

router.post("/create", verifyJwtToken, create);
router.post("/verify-payment", verifyJwtToken, verify);

module.exports = router;
