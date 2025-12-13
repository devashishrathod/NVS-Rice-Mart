const mongoose = require("mongoose");
const { ProductField, locationField } = require("./validObjectId");

const productLocationSchema = new mongoose.Schema(
  {
    productId: ProductField,
    locationId: locationField,
    zipcode: { type: String },
    price: { type: Number, default: 0 },
    stockQuantity: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

productLocationSchema.index(
  { productId: 1, locationId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

productLocationSchema.index({ productId: 1 });
productLocationSchema.index({ locationId: 1 });

module.exports = mongoose.model("ProductLocation", productLocationSchema);
