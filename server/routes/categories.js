const express = require("express");
const router = express.Router();

const { isVendor, verifyJwtToken } = require("../middlewares");
const {
  createCategory,
  getAllCategories,
  getCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/categories");

router.post("/create", isVendor, createCategory);
router.get("/getAll", verifyJwtToken, getAllCategories);
router.get("/get/:id", verifyJwtToken, getCategory);
router.put("/update/:id", isVendor, updateCategory);
router.delete("/delete/:id", isVendor, deleteCategory);

module.exports = router;
