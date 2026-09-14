// const mongoose = require("mongoose");
// const { ProductField, userField } = require("./validObjectId");

// const cartItemSchema = new mongoose.Schema({
//   _id: false,
//   productId: ProductField,
//   quantity: { type: Number, required: true, min: 1, default: 1 },
// });

// const cartSchema = new mongoose.Schema(
//   {
//     userId: userField,
//     items: [cartItemSchema],
//     subTotal: { type: Number, default: 0 },
//     isPurchased: { type: Boolean, default: false },
//     isDeleted: { type: Boolean, default: false },
//   },
//   { timestamps: true, versionKey: false }
// );

// cartSchema.pre("save", function () {
//   if (this.items.length === 0) {
//     this.isDeleted = true;
//     this.subTotal = 0;
//   }
// });

// module.exports = mongoose.model("Cart", cartSchema);

const mongoose = require("mongoose");
const { ProductField, userField } = require("./validObjectId");

const cartItemSchema = new mongoose.Schema(
  {
    _id: false,
    productId: ProductField,
    // NOTE: `vendorId` yahan NAHI hai — cart level pe hai aur ek cart =
    // ek vendor (D2). Har item pe dobara likhna duplication tha.
    quantity: { type: Number, required: true, min: 1 },
    productWeight: { type: Number, required: true },
    itemWeight: { type: Number, required: true },
    priceSnapshot: { type: Number, required: true },
    resolvedPincode: { type: String },
  },
  { versionKey: false },
);

const cartSchema = new mongoose.Schema(
  {
    userId: userField,
    // 🔒 Ek cart = ek vendor. Doosre vendor ka item add karne pe
    // 409 CART_VENDOR_CONFLICT milta hai.
    vendorId: userField,
    items: [cartItemSchema],
    totalWeight: { type: Number, default: 0 },
    totalQuantity: { type: Number, default: 0 },
    subTotal: { type: Number, default: 0 },
    // verify-delivery ke waqt resolve hua pincode
    deliveryZipcode: { type: String },
    // Cart badalne pe null ho jata hai — checkout se pehle dobara verify
    // karna padta hai.
    verifiedAt: { type: Date, default: null },
    isPurchased: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

cartSchema.pre("save", function () {
  if (this.items.length === 0) {
    this.isDeleted = true;
    this.subTotal = 0;
    this.totalWeight = 0;
    this.totalQuantity = 0;
  }
});

cartSchema.index({ userId: 1, isPurchased: 1, isDeleted: 1 });

module.exports = mongoose.model("Cart", cartSchema);
