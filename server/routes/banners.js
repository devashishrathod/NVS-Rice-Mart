const express = require("express");
const router = express.Router();

const { isAdmin, verifyJwtToken } = require("../middlewares");
const {
  create,
  //   getAll,
  get,
  // update,
  // deleteProduct,
} = require("../controllers/banners");

router.post("/create", isAdmin, create);
// router.get("/getAll", verifyJwtToken, getAll);
router.get("/get/:id", verifyJwtToken, get);
// router.put("/update/:id", isAdmin, update);
// router.delete("/delete/:id", isAdmin, deleteProduct);

module.exports = router;
