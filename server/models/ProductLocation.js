const mongoose = require("mongoose");
const { ProductField, locationField } = require("./validObjectId");

const productLocationSchema = new mongoose.Schema(
  {
    productId: ProductField,
    locationId: locationField,
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("ProductLocation", productLocationSchema);
