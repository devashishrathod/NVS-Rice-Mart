const mongoose = require("mongoose");
const { ROLES } = require("../constants");
const { asyncWrapper } = require("../utils");
const { resolveServiceContext } = require("../services/serviceAreas");
const {
  applyServiceScope,
} = require("../services/serviceAreas/applyServiceScope");

/**
 * `req.serviceContext` set karta hai — teeno listing services isse filter
 * banate hain. `verifyJwtToken` ke BAAD lagana (req.role chahiye).
 *
 *   CUSTOMER → uske pincode ka vendor  (404 agar serve nahi hota)
 *   VENDOR   → sirf apna data (inactive bhi, taaki manage kar sake)
 *   ADMIN    → sab, ya `?vendorId=` se ek vendor
 *
 * Shape:
 *   {
 *     mode: "CUSTOMER" | "VENDOR" | "ADMIN",
 *     vendorIds: ObjectId[] | null,   // null = koi filter nahi (admin)
 *     activeOnly: boolean,            // customer ko sirf isActive dikhta hai
 *     pincode?: string,
 *     vendorId?: ObjectId,
 *     vendor?: { shopName, ... }
 *   }
 */
exports.attachServiceContext = asyncWrapper(async (req, res, next) => {
  const role = req.role;

  // ── Vendor: sirf apna ────────────────────────────────────
  if (role === ROLES.VENDOR) {
    req.serviceContext = {
      mode: "VENDOR",
      vendorIds: [req.userId],
      activeOnly: false,
    };
    return next();
  }

  // ── Admin / staff: sab, ya explicit filter ───────────────
  if (role === ROLES.ADMIN || role === ROLES.STAFF) {
    const vendorId = req.query?.vendorId;
    req.serviceContext = {
      mode: "ADMIN",
      vendorIds:
        vendorId && mongoose.Types.ObjectId.isValid(vendorId)
          ? [new mongoose.Types.ObjectId(vendorId)]
          : null,
      activeOnly: false,
    };
    return next();
  }

  // ── Customer: pincode se vendor resolve ──────────────────
  // `userId` query param customer ke liye ignore hota hai — warna wo kisi
  // aur vendor ka catalog force kar leta.
  const ctx = await resolveServiceContext({
    zipcode: req.query?.zipcode,
    locationId: req.query?.locationId,
    userId: req.userId,
  });

  req.serviceContext = {
    mode: "CUSTOMER",
    vendorIds: ctx.vendorIds,
    vendorId: ctx.vendorId,
    pincode: ctx.pincode,
    vendor: ctx.vendor,
    activeOnly: true,
  };
  next();
});

// Convenience re-export — asli implementation service layer me hai
// (services ko middlewares se import nahi karna chahiye).
exports.applyServiceScope = applyServiceScope;
