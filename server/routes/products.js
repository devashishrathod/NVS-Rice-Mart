const express = require("express");
const router = express.Router();

const {
  verifyJwtToken,
  isVendor,
  attachServiceContext,
} = require("../middlewares");
const {
  create,
  getAll,
  getOne,
  update,
  deleteProduct,
} = require("../controllers/products");

router.post("/create", isVendor, create);
// attachServiceContext: customer → uske pincode ka vendor, vendor → khud,
// admin → sab. verifyJwtToken ke BAAD hi lagana (req.role chahiye).
router.get("/getAll", verifyJwtToken, attachServiceContext, getAll);
router.get("/get/:id", verifyJwtToken, attachServiceContext, getOne);
router.put("/update/:id", isVendor, update);
router.delete("/delete/:id", isVendor, deleteProduct);

// ⛔ Purane `update-product-locations` / `remove-product-locations` routes
// hata diye gaye. Price aur stock ka single source ab `Product` hai (D3),
// aur `productlocations` collection migration me drop ho jati hai.
// (Un routes pe koi auth middleware bhi nahi tha — anonymous user kisi bhi
// product ka price/stock badal sakta tha.)

module.exports = router;
