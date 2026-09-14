const mongoose = require("mongoose");
const { VENDOR_STATUS, DEFAULT_VENDOR_DELIVERY } = require("../constants");
const { userField, locationField } = require("./validObjectId");

const D = DEFAULT_VENDOR_DELIVERY;

/**
 * Vendor ki business details. `User` ko sirf identity/auth ke liye rakha hai;
 * shop ki saari cheezein yahan.
 */
const vendorProfileSchema = new mongoose.Schema(
  {
    vendorId: { ...userField, required: true, unique: true },

    shopName: { type: String, required: true, trim: true },
    legalName: { type: String, trim: true },
    gstNumber: { type: String, trim: true, uppercase: true },
    fssaiNumber: { type: String, trim: true },
    logo: { type: String },
    supportMobile: { type: String },

    // 📍 Pickup point — delivery distance HAMESHA isi branch ke lat/lng se
    // calculate hoti hai (chahe vendor ke kitne bhi branch hon).
    defaultLocationId: locationField,

    /**
     * Per-vendor delivery config — VENDOR khud apne panel se manage karta
     * hai (baaki sab profile fields admin ke haath me hain).
     *
     * 🔑 `isEnabled` MASTER SWITCH hai. `false` (default) hone par charge
     *    hamesha ₹0 — chahe baaki values bhari hui hon, chahe admin ne
     *    per-pincode override set kiya ho.
     *
     * Baaki values `DEFAULT_VENDOR_DELIVERY` se aati hain (wahi rates jo
     * purane global Setting me the), taaki vendor ko khali form na mile.
     */
    delivery: {
      isEnabled: { type: Boolean, default: D.isEnabled },

      // charge banane wale
      baseCharge: { type: Number, default: D.baseCharge, min: 0 },
      perKmRate: { type: Number, default: D.perKmRate, min: 0 },
      perKgRate: { type: Number, default: D.perKgRate, min: 0 },
      minDeliveryCharge: { type: Number, default: D.minDeliveryCharge, min: 0 },

      // upper cap — `null` set karo to KOI CAP NAHI (0 set karne pe cap 0
      // ho jayega aur charge hamesha ₹0 rahega)
      baseMaxCharge: { type: Number, default: D.baseMaxCharge, min: 0 },
      maxPerKgIncrement: { type: Number, default: D.maxPerKgIncrement, min: 0 },
      maxPerKmIncrement: { type: Number, default: D.maxPerKmIncrement, min: 0 },

      // null = kabhi free nahi (0 hota to SAB free ho jata)
      freeDeliveryAbove: { type: Number, default: D.freeDeliveryAbove, min: 0 },
      minOrderAmount: { type: Number, default: D.minOrderAmount, min: 0 },

      // Vendor apna chhota radius set kar sakta hai; global
      // `Setting.delivery.maxRadiusKm` hard cap hai, usse upar nahi ja sakta.
      // null = platform ka radius lagega.
      maxRadiusKm: { type: Number, default: D.maxRadiusKm, min: 0 },
    },

    commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
    payout: {
      accountHolder: { type: String },
      accountNumber: { type: String },
      ifsc: { type: String, uppercase: true },
      upiId: { type: String },
    },

    // Sirf admin control karta hai. SUSPENDED hote hi us vendor ka catalog
    // customers ko dikhna band ho jata hai.
    status: {
      type: String,
      enum: [...Object.values(VENDOR_STATUS)],
      default: VENDOR_STATUS.APPROVED,
    },
    // NOTE: `isOpen` / shop-timing ka koi field NAHI hai — order 24×7 aate
    // rahenge, vendor kabhi bhi deliver karega.
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

vendorProfileSchema.index({ status: 1, isDeleted: 1 });
vendorProfileSchema.index({ shopName: 1 });

module.exports = mongoose.model("VendorProfile", vendorProfileSchema);
