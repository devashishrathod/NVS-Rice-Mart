const express = require("express");
const router = express.Router();

const { isAdmin, isVendor, verifyJwtToken } = require("../middlewares");
const {
  create,
  getAll,
  get,
  update,
  updateMyDelivery,
  updateStatus,
  listBranches,
  addBranch,
  makeBranchDefault,
  listServiceAreas,
  addAreas,
  removeArea,
} = require("../controllers/vendors");

// ── Vendor CRUD — sirf admin ────────────────────────────────
router.post("/create", isAdmin, create);
router.get("/getAll", isAdmin, getAll);
router.put("/update/:id", isAdmin, update);
router.put("/status/:id", isAdmin, updateStatus);

// ── 🏪 Vendor ka apna — SIRF delivery settings ──────────────
// Shop name, mobile, address, branches, service areas, commission, status —
// sab admin ke haath me hain (D8). Vendor unke liye admin ko request karega.
router.put("/me/delivery", isVendor, updateMyDelivery);

// ── Read-only — admin ya vendor khud ────────────────────────
// (controller ke andar self/admin check hai)
router.get("/get/:id", verifyJwtToken, get);
router.get("/:id/branches", verifyJwtToken, listBranches);
router.get("/:id/service-areas", verifyJwtToken, listServiceAreas);

// ── Branch + service area management — sirf admin ───────────
// Vendor change ke liye admin ko request karega.
router.post("/:id/branches", isAdmin, addBranch);
router.put("/:id/branches/:locationId/default", isAdmin, makeBranchDefault);
router.post("/:id/service-areas", isAdmin, addAreas);
router.delete("/:id/service-areas/:areaId", isAdmin, removeArea);

module.exports = router;
