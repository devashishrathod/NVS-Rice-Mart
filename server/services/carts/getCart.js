const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const VendorProfile = require("../../models/VendorProfile");
const { throwError } = require("../../utils");
const { recalcCartTotals } = require("./recalcCartTotals");

exports.getCart = async (userId) => {
  const cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  });
  if (!cart || !cart.items.length) throwError(404, "Your cart is empty");

  // Ek hi query me saare products (pehle per-item findOne hota tha)
  const ids = cart.items.map((i) => i.productId);
  const products = await Product.find({
    _id: { $in: ids },
    isDeleted: false,
    isActive: true,
  })
    .select("name brand image generalPrice stockQuantity weightInKg isOutOfStock")
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  let cartChanged = false;
  const validItems = [];
  for (const item of cart.items) {
    const p = byId.get(String(item.productId));
    if (!p || p.isOutOfStock || p.stockQuantity <= 0) {
      cartChanged = true;
      continue;
    }
    let quantity = item.quantity;
    if (quantity > p.stockQuantity) {
      quantity = p.stockQuantity;
      cartChanged = true;
    }
    // ⚠️ `priceSnapshot` ko generalPrice se blindly overwrite NAHI karte —
    // pehle aisa hota tha, jisse verify-delivery ke baad price wapas palat
    // jata tha. Price badla hai to `verifiedAt` reset karke customer ko
    // dobara verify karwate hain.
    if (p.generalPrice !== item.priceSnapshot) {
      item.priceSnapshot = p.generalPrice;
      cartChanged = true;
    }
    validItems.push({
      ...item.toObject(),
      quantity,
      productWeight: p.weightInKg,
      itemWeight: p.weightInKg * quantity,
      product: {
        _id: p._id,
        name: p.name,
        brand: p.brand,
        image: p.image,
        weightInKg: p.weightInKg,
        stockQuantity: p.stockQuantity,
      },
    });
  }

  if (!validItems.length) {
    cart.items = [];
    cart.isDeleted = true;
    recalcCartTotals(cart);
    await cart.save();
    throwError(
      404,
      "All items in your cart are no longer available or out of stock",
    );
  }

  cart.items = validItems.map(({ product, ...rest }) => rest);
  recalcCartTotals(cart);
  if (cartChanged) {
    cart.verifiedAt = null; // cart badla → dobara verify karna hoga
    await cart.save();
  }

  const profile = cart.vendorId
    ? await VendorProfile.findOne({ vendorId: cart.vendorId })
        .select("shopName logo")
        .lean()
    : null;

  // Response me product details bhi bhej rahe hain taaki app ko har item ke
  // liye alag call na karni pade.
  return {
    ...cart.toObject(),
    items: validItems,
    vendor: profile
      ? { id: cart.vendorId, shopName: profile.shopName, logo: profile.logo }
      : null,
  };
};
