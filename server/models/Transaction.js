const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    gateway: {
      type: String,
      enum: ["RAZORPAY"],
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    amount: Number,
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
    rawResponse: Object,
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Transaction", transactionSchema);
