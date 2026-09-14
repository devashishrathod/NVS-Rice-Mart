const express = require("express");
const router = express.Router();

const { isAdmin, verifyJwtToken } = require("../middlewares");
const { check, lookup, reassign } = require("../controllers/serviceAreas");

// Customer-facing — login mandatory hai (guest browsing nahi)
router.get("/check", verifyJwtToken, check);

// Admin-only
router.get("/lookup", isAdmin, lookup);
router.put("/reassign", isAdmin, reassign);

module.exports = router;
