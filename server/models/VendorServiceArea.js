const mongoose = require("mongoose");
const { userField, locationField } = require("./validObjectId");

/**
 * "Kaun sa vendor kaun se pincode pe deliver karta hai."
 *
 * 🔒 EXCLUSIVE TERRITORY: ek pincode sirf EK vendor ke paas ho sakta hai.
 *    Ye rule DB level pe `{ zipcode: 1 }` unique index se enforce hai.
 *
 * Customer ka har listing request isi collection pe ek lookup karta hai,
 * isliye ise chhota aur focused rakha hai (poora address `Location` me hai).
 */
const vendorServiceAreaSchema = new mongoose.Schema(
  {
    vendorId: { ...userField, required: true },
    // Kaun si branch is pincode ko serve karti hai. Abhi delivery distance
    // vendor ke DEFAULT branch se nikalti hai, par per-branch pickup pe
    // switch karna ho to ye field ready hai.
    locationId: { ...locationField, required: true },

    zipcode: { type: String, required: true, trim: true },
    city: { type: String, lowercase: true, trim: true },
    district: { type: String, lowercase: true, trim: true },
    state: { type: String, lowercase: true, trim: true },
    country: { type: String, lowercase: true, trim: true, default: "india" },

    // Per-area overrides (optional). Set na ho to VendorProfile.delivery se.
    deliveryChargeOverride: { type: Number },
    minOrderAmount: { type: Number },
    freeDeliveryAbove: { type: Number },
    etaMinutes: { type: Number },

    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

// 🔒 D1 — ek pincode = ek vendor. partialFilterExpression isliye taaki
// soft-deleted row us pincode ko block na kare (reassign ke liye zaruri).
vendorServiceAreaSchema.index(
  { zipcode: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
// Customer lookup ka hot path
vendorServiceAreaSchema.index({ zipcode: 1, isActive: 1, isDeleted: 1 });
// Vendor panel / admin listing
vendorServiceAreaSchema.index({ vendorId: 1, isActive: 1, isDeleted: 1 });

module.exports = mongoose.model("VendorServiceArea", vendorServiceAreaSchema);
