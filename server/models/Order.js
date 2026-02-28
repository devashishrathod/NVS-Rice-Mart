const mongoose = require("mongoose");
const {
  userField,
  cartField,
  ProductField,
  locationField,
} = require("./validObjectId");

const orderItemSchema = new mongoose.Schema(
  {
    productId: ProductField,
    quantity: Number,
    price: Number,
    locationId: locationField,
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    userId: userField,
    cartId: cartField,
    locationId: locationField,
    items: [orderItemSchema],
    distanceKm: Number,
    deliveryCharge: Number,
    subTotal: Number,
    payableAmount: Number,
    paymentMethod: {
      type: String,
      enum: ["ONLINE", "COD"],
      required: true,
    },
    status: {
      type: String,
      enum: ["INITIATED", "PENDING", "CONFIRMED", "DELIVERED", "CANCELLED"],
      default: "INITIATED",
    },
    paymentStatus: {
      type: String,
      enum: ["NOT_REQUIRED", "INITIATED", "SUCCESS", "FAILED"],
      default: "NOT_REQUIRED",
    },
    razorpayOrderId: String,
    deliveryPincode: String,
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("Order", orderSchema);
