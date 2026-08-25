const express = require("express");
const router = express.Router();

const { verifyJwtToken, isVendor } = require("../middlewares");
const {
  create,
  getAll,
  getOne,
  update,
  deleteProduct,
  addProductLocations,
  removeProductLocations,
  checkProductDelivery,
} = require("../controllers/products");

router.post("/create", isVendor, create);
router.get("/getAll", verifyJwtToken, getAll);
router.get("/get/:id", verifyJwtToken, getOne);
router.put("/update/:id", isVendor, update);
router.delete("/delete/:id", isVendor, deleteProduct);
router.put(
  "/update-product-locations/:productId",
  // isAdmin,
  addProductLocations,
);
router.delete(
  "/remove-product-locations/:productId",
  // isAdmin,
  removeProductLocations,
);
// router.post("/check-delivery/:productId", verifyJwtToken, checkProductDelivery);

module.exports = router;
