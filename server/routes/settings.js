const express = require("express");
const router = express.Router();

const { isAdmin } = require("../middlewares");
const { create, update, get } = require("../controllers/settings");

router.post("/create", isAdmin, create);
router.put("/update", isAdmin, update);
// 🔒 Pehle har logged-in user (customer bhi) ye padh sakta tha. Ab isme
// sirf platform hard-caps hain jo customer ke kisi kaam ke nahi — aur
// shop address populate hoke jata tha. Isliye admin-only.
router.get("/get", isAdmin, get);

module.exports = router;
