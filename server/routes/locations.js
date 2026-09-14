const express = require("express");
const router = express.Router();

const { verifyJwtToken } = require("../middlewares");
const {
  create,
  getAll,
  get,
  update,
  setDefault,
  deleteLocation,
} = require("../controllers/locations");

router.post("/create", verifyJwtToken, create);
router.get("/getAll", verifyJwtToken, getAll);
router.get("/get/:id", verifyJwtToken, get);
router.put("/update/:id", verifyJwtToken, update);
// Customer apna default delivery address badal sake — `resolveServiceContext`
// isi se uska pincode uthata hai.
router.put("/set-default/:id", verifyJwtToken, setDefault);
router.delete("/delete/:id", verifyJwtToken, deleteLocation);

module.exports = router;
