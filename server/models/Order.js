const mongoose = require("mongoose");
const { userField, ProductField } = require("./validObjectId");

const orderItemSchema = new mongoose.Schema(
  {
    productId: ProductField,
    quantity: Number,
    price: Number,
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: userField,
    items: [orderItemSchema],
    subTotal: Number,
    payableAmount: Number,
    paymentMethod: {
      type: String,
      enum: ["ONLINE", "COD"],
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "PAID", "CANCELLED"],
      default: "PENDING",
    },
    paymentStatus: {
      type: String,
      enum: ["NOT_REQUIRED", "INITIATED", "SUCCESS", "FAILED"],
      default: "NOT_REQUIRED",
    },
    razorpayOrderId: String,
    deliveryPincode: String,
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Order", orderSchema);
