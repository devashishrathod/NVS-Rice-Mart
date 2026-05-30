const express = require("express");
const router = express.Router();

const { getUser, updateUser, getAll } = require("../controllers/users");
const { verifyJwtToken, isAdmin } = require("../middlewares");

router.get("/get", verifyJwtToken, getUser);
router.get("/getAll", isAdmin, getAll);
router.put("/update", verifyJwtToken, updateUser);

module.exports = router;
