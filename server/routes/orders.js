const express = require("express");
const router = express.Router();

const {
  verifyJwtToken,
  isUser,
  isVendor,
  isAdmin,
} = require("../middlewares");
const {
  create,
  preview,
  getAll,
  get,
  updateStatus,
  cancel,
  vendorSummary,
  adminSummary,
} = require("../controllers/orders");

// ── Customer ────────────────────────────────────────────────
router.post("/preview", isUser, preview);
router.post("/create", isUser, create);
router.put("/:id/cancel", isUser, cancel);

// ── Read — role ke hisaab se scope hota hai (service ke andar) ──
// customer → apne, vendor → apne, admin → sab
router.get("/getAll", verifyJwtToken, getAll);
router.get("/get/:id", verifyJwtToken, get);

// ── Vendor ──────────────────────────────────────────────────
router.get("/vendor/summary", isVendor, vendorSummary);
// 🔒 Sirf vendor. Admin read-only hai (D6) — usko yahan 403 milega.
router.put("/:id/status", isVendor, updateStatus);

// ── Admin (read-only) ───────────────────────────────────────
router.get("/admin/summary", isAdmin, adminSummary);

// ⛔ Online payment (Razorpay) abhi disabled — sirf COD.
// Enable karte waqt `verifyPayment` ka status="PAID" wala bug pehle fix karna.
// router.post("/verify-payment", verifyJwtToken, verify);

// ⛔ Purana blanket update route hata diya — ab `PUT /:id/status` hai jo
// state machine validate karta hai.
// router.put("/update/:id", isAdmin, update);

module.exports = router;
