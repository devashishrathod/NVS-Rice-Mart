const mongoose = require("mongoose");

/**
 * Atomic sequence generator. `orderNumber` ke liye timestamp+random se
 * behtar hai — collision ka koi chance nahi, chahe kitne bhi orders ek
 * saath aayein.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String }, // e.g. "order:2609"
    seq: { type: Number, default: 0 },
  },
  { versionKey: false },
);

module.exports = mongoose.model("Counter", counterSchema);
