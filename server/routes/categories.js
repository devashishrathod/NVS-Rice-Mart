const express = require("express");
const router = express.Router();

const {
  isVendor,
  verifyJwtToken,
  attachServiceContext,
} = require("../middlewares");
const {
  createCategory,
  getAllCategories,
  getCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categories");

router.post("/create", isVendor, createCategory);
// attachServiceContext: customer → uske pincode ka vendor, vendor → khud,
// admin → sab. verifyJwtToken ke BAAD hi lagana (req.role chahiye).
router.get("/getAll", verifyJwtToken, attachServiceContext, getAllCategories);
router.get("/get/:id", verifyJwtToken, attachServiceContext, getCategory);
router.put("/update/:id", isVendor, updateCategory);
router.delete("/delete/:id", isVendor, deleteCategory);

module.exports = router;
