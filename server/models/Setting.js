const mongoose = require("mongoose");
const { locationField } = require("./validObjectId");

const settingSchema = new mongoose.Schema(
  {
    delivery: {
      shopLocationId: locationField,
      baseCharge: { type: Number, default: 30 },
      perKmRate: { type: Number, default: 5 },
      perKgRate: { type: Number, default: 1.5 },
      distanceFactor: { type: Number, default: 4 },
      weightFactor: { type: Number, default: 6 },
      minDeliveryCharge: { type: Number, default: 40 },
      baseMaxCharge: { type: Number, default: 150 },
      maxPerKgIncrement: { type: Number, default: 1.2 },
      maxPerKmIncrement: { type: Number, default: 4 },
      maxRadiusKm: { type: Number, default: 50 },
    },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("Setting", settingSchema);
