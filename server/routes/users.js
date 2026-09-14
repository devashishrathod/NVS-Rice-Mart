const express = require("express");
const router = express.Router();

const { getUser, updateUser, getAll } = require("../controllers/users");
const { verifyJwtToken, isAdmin } = require("../middlewares");

router.get("/get", verifyJwtToken, getUser);
// 🔒 Pehle ye sirf verifyJwtToken pe tha — koi bhi customer poori user list
// (naam, email, mobile) nikal sakta tha. Ab sirf admin.
router.get("/getAll", isAdmin, getAll);
router.put("/update", verifyJwtToken, updateUser);

module.exports = router;
