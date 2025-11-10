const mongoose = require("mongoose");
const { PRODUCT_TYPES, DEFAULT_IMAGES } = require("../constants");
const { categoryField, subCategoryField } = require("./validObjectId");

const productSchema = new mongoose.Schema(
  {
    categoryId: categoryField,
    subCategoryId: subCategoryField,
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    generalPrice: { type: Number, required: true },
    stockQuantity: { type: Number, required: true },
    SKU: { type: String, required: true, trim: true },
    weightInKg: { type: Number, required: true },
    description: { type: String, trim: true },
    image: { type: String, default: DEFAULT_IMAGES.PRODUCT },
    type: {
      type: String,
      enum: [...Object.values(PRODUCT_TYPES)],
      default: PRODUCT_TYPES.GROCERY,
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Product", productSchema);
