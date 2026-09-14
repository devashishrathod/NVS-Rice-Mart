const mongoose = require("mongoose");
const { DEFAULT_IMAGES } = require("../constants");
const { userField, categoryField } = require("./validObjectId");

const subCategorySchema = new mongoose.Schema(
  {
    userId: { ...userField, required: true },
    categoryId: categoryField,
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    image: { type: String, default: DEFAULT_IMAGES.SUBCATEGORY },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

subCategorySchema.index({ userId: 1, isDeleted: 1, isActive: 1 });
subCategorySchema.index({ categoryId: 1, isDeleted: 1, isActive: 1 });
// NOTE: `{ categoryId, name }` unique index Phase 1 me banega.

module.exports = mongoose.model("SubCategory", subCategorySchema);
