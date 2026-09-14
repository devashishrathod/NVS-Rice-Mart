const mongoose = require("mongoose");

/**
 * Platform-level settings (ek hi doc, admin manage karta hai).
 *
 * ⚠️ Delivery ka PRICING per-vendor hai (`VendorProfile.delivery`).
 *    Yahan sirf platform ke HARD LIMITS rehte hain jinse koi vendor upar
 *    nahi ja sakta.
 *
 * Purane `baseCharge`/`perKmRate`/… aur `shopLocationId` schema se hata
 * diye gaye hain — migration unhe vendor ke profile me move karke DB se
 * bhi $unset kar deti hai.
 */
const settingSchema = new mongoose.Schema(
  {
    delivery: {
      // Koi bhi vendor isse zyada door deliver nahi kar sakta
      maxRadiusKm: { type: Number, default: 50 },
      // Koi bhi vendor ek order pe isse zyada delivery charge nahi laga sakta
      maxAllowedDeliveryCharge: { type: Number, default: 200 },
    },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("Setting", settingSchema);
