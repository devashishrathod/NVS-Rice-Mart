const express = require("express");
const router = express.Router();

const {
  verifyJwtToken,
  isVendor,
  attachServiceContext,
} = require("../middlewares");
const {
  createSubCategory,
  getAllSubCategories,
  getSubCategory,
  updateSubCategory,
  deleteSubCategory,
} = require("../controllers/subCategories");

router.post("/:categoryId/create", isVendor, createSubCategory);
router.get("/getAll", verifyJwtToken, attachServiceContext, getAllSubCategories);
router.get("/get/:id", verifyJwtToken, attachServiceContext, getSubCategory);
router.put("/update/:id", isVendor, updateSubCategory);
router.delete("/delete/:id", isVendor, deleteSubCategory);

module.exports = router;
