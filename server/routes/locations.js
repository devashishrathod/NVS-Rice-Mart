const express = require("express");
const router = express.Router();

const { verifyJwtToken } = require("../middlewares");
const {
  create,
  upsert,
  getAll,
  get,
  update,
  setDefault,
  deleteLocation,
} = require("../controllers/locations");

router.post("/create", verifyJwtToken, create);
// 🆕 "Mera address save kar do" — address na ho to banata hai, ho to update
// karta hai. Customer apna, admin `userId` bhej ke kisi ka bhi.
// Isse wo duplicate-spam rukta hai jo `create` se hota tha (ek customer ke
// 8 address, 6 identical — prod data me mila).
// ⚠️ `/update/:id` se pehle rakha hai taaki "upsert" ko `:id` na samjha jaye.
router.put("/upsert", verifyJwtToken, upsert);
router.get("/getAll", verifyJwtToken, getAll);
router.get("/get/:id", verifyJwtToken, get);
router.put("/update/:id", verifyJwtToken, update);
// Customer apna default delivery address badal sake — `resolveServiceContext`
// isi se uska pincode uthata hai.
router.put("/set-default/:id", verifyJwtToken, setDefault);
router.delete("/delete/:id", verifyJwtToken, deleteLocation);

module.exports = router;
