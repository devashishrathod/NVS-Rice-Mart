const mongoose = require("mongoose");
const { PRODUCT_TYPES, DEFAULT_IMAGES } = require("../constants");
const {
  categoryField,
  subCategoryField,
  locationsField,
} = require("./validObjectId");

const productSchema = new mongoose.Schema(
  {
    categoryId: categoryField,
    subCategoryId: subCategoryField,
    locationIds: locationsField,
    name: { type: String, required: true, trim: true },
    brand: { type: String, trim: true },
    description: { type: String, trim: true },
    type: {
      type: String,
      enum: [...Object.values(PRODUCT_TYPES)],
      default: PRODUCT_TYPES.GROCERY,
    },
    image: { type: String, default: DEFAULT_IMAGES.PRODUCT },
    generalPrice: { type: Number, required: true },
    stockQuantity: { type: Number, required: true },
    SKU: { type: String, trim: true },
    weightInKg: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Product", productSchema);
