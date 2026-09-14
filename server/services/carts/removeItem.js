const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const { validateObjectId, throwError } = require("../../utils");
const { recalcCartTotals } = require("./recalcCartTotals");

exports.removeItem = async (userId, productId, payload) => {
  const { action } = payload;
  validateObjectId(productId, "Product Id");
  if (action !== "remove" && action !== "decrease") {
    throwError(422, "Invalid action on cart");
  }

  const cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  });
  if (!cart) throwError(404, "Cart not found");

  const itemIndex = cart.items.findIndex(
    (i) => i.productId.toString() === productId,
  );
  if (itemIndex === -1) throwError(404, "Product not found in cart");

  // ⚠️ Cart stock ko KABHI touch nahi karta. Pehle yahan
  // `product.stockQuantity += qty` hota tha jabki add karte waqt kabhi
  // ghataya hi nahi jata tha — isse stock lagatar badhta rehta tha
  // (prod me 21 products ka stock isi wajah se inflated hai).
  // Stock sirf order place hone par reserve hota hai.
  if (action === "remove") {
    cart.items.splice(itemIndex, 1);
  } else {
    cart.items[itemIndex].quantity -= 1;
    if (cart.items[itemIndex].quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].itemWeight =
        cart.items[itemIndex].productWeight * cart.items[itemIndex].quantity;
    }
  }

  if (cart.items.length === 0) {
    cart.items = [];
    cart.vendorId = undefined; // vendor lock bhi chhoot jaye
    cart.verifiedAt = null;
    cart.deliveryZipcode = undefined;
    cart.isDeleted = true;
    recalcCartTotals(cart);
    await cart.save();
    // ⚠️ Legacy behaviour: HTTP 200 par `success: false`. App isi pe depend
    // karta hai, isliye badla nahi.
    throwError(200, "Your cart is now empty");
  }

  const productIds = cart.items.map((i) => i.productId);
  const products = await Product.find(
    { _id: { $in: productIds } },
    { generalPrice: 1, weightInKg: 1 },
  ).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  cart.items.forEach((i) => {
    const p = byId.get(String(i.productId));
    if (p) {
      i.priceSnapshot = p.generalPrice;
      i.productWeight = p.weightInKg;
      i.itemWeight = p.weightInKg * i.quantity;
    }
  });

  // Cart badla → checkout se pehle dobara verify karna hoga
  cart.verifiedAt = null;
  recalcCartTotals(cart);
  return await cart.save();
};
