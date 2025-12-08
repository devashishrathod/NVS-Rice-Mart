const mongoose = require("mongoose");
const { ProductField, userField } = require("./validObjectId");

const cartItemSchema = new mongoose.Schema({
  _id: false,
  productId: ProductField,
  quantity: { type: Number, required: true, min: 1, default: 1 },
});

const cartSchema = new mongoose.Schema(
  {
    userId: userField,
    items: [cartItemSchema],
    subTotal: { type: Number, default: 0 },
    isPurchased: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

cartSchema.pre("save", function () {
  if (this.items.length === 0) {
    this.isDeleted = true;
    this.subTotal = 0;
  }
});

module.exports = mongoose.model("Cart", cartSchema);
