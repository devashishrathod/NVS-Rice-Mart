const mongoose = require("mongoose");
const { DEFAULT_IMAGES } = require("../constants");
const { userField } = require("./validObjectId");

const categorySchema = new mongoose.Schema(
  {
    userId: { ...userField, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    image: { type: String, default: DEFAULT_IMAGES.CATEGORY },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

// Customer listing ka hot path: userId (vendor) + active filter
categorySchema.index({ userId: 1, isDeleted: 1, isActive: 1 });
// NOTE: `{ userId, name }` unique index Phase 1 me migration ke baad banega
// (abhi saare docs me userId null hai, isliye index bana hi nahi sakta).

module.exports = mongoose.model("Category", categorySchema);
