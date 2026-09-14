const mongoose = require("mongoose");
const {
  userField,
  cartField,
  ProductField,
  locationField,
} = require("./validObjectId");
const {
  ORDER_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
} = require("../constants");

const orderItemSchema = new mongoose.Schema(
  {
    productId: ProductField,
    quantity: Number,
    price: Number, // order ke waqt ka price — kabhi nahi badalta
    // Product delete/rename ho jaye to bhi purana order readable rahe
    productSnapshot: {
      name: String,
      brand: String,
      SKU: String,
      image: String,
      weightInKg: Number,
    },
    // NOTE: `vendorId` yahan NAHI hai — order level pe hai aur ek order =
    // ek vendor (D1 + D2). Har item pe dobara likhna duplication tha.
    // NOTE: purana `locationId` bhi hata diya (ProductLocation ke saath).
    // DB me kabhi set hua hi nahi tha (0/76).
  },
  { _id: false },
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: String,
    changedBy: userField,
    changedByRole: String,
    note: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    userId: userField,
    // 🔑 Order kis vendor ka hai. Vendor dashboard ka main filter.
    vendorId: userField,
    // Pickup branch (vendor ka isDefault) — distance isi se nikli thi
    vendorLocationId: locationField,
    cartId: cartField,
    // Customer ka delivery address
    locationId: locationField,
    orderNumber: { type: String },

    items: [orderItemSchema],

    distanceKm: Number,
    deliveryCharge: { type: Number, default: 0 },
    subTotal: Number,
    payableAmount: Number,
    deliveryPincode: String,

    paymentMethod: {
      type: String,
      enum: [...Object.values(PAYMENT_METHODS)],
      required: true,
    },
    status: {
      type: String,
      enum: [...Object.values(ORDER_STATUS)],
      default: ORDER_STATUS.INITIATED,
    },
    paymentStatus: {
      type: String,
      enum: [...Object.values(PAYMENT_STATUS)],
      default: PAYMENT_STATUS.NOT_REQUIRED,
    },
    razorpayOrderId: String,

    statusHistory: [statusHistorySchema],
    cancelReason: { type: String },
    deliveredAt: { type: Date },
    // NOTE: `expectedDeliveryAt` hata diya — koi writer nahi tha. ETA abhi
    // `VendorServiceArea.etaMinutes` se aata hai, order pe store nahi hota.

    // Rider/staff ke liye reserve — abhi koi logic nahi
    assignedTo: { ...userField, default: null },
    assignedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// vendor dashboard ka hot path
orderSchema.index({ vendorId: 1, status: 1, createdAt: -1 });
// customer ki order history
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ razorpayOrderId: 1 }, { sparse: true });
// `sparse` isliye ki purane orders me `orderNumber` hai hi nahi — wo index
// se bahar rahenge. Unique schema me hi declare kar rahe hain taaki
// `autoIndex` aur migration dono ek hi index banayein (warna ek non-unique
// bana deta hai aur migration ka unique `IndexOptionsConflict` se fail ho
// jata — chup-chaap).
orderSchema.index({ orderNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Order", orderSchema);
