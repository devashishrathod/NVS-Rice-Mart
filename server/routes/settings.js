const express = require("express");
const router = express.Router();

const { isAdmin, verifyJwtToken } = require("../middlewares");
const { create, update, get } = require("../controllers/settings");

router.post("/create", isAdmin, create);
router.put("/update", isAdmin, update);
router.get("/get", verifyJwtToken, get);

module.exports = router;
