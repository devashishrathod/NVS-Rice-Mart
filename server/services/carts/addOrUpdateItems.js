const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const VendorProfile = require("../../models/VendorProfile");
const { ERROR_CODES } = require("../../constants");
const { validateObjectId, throwError } = require("../../utils");
const { recalcCartTotals } = require("./recalcCartTotals");

const shopNameOf = async (vendorId) => {
  if (!vendorId) return null;
  const p = await VendorProfile.findOne({ vendorId })
    .select("shopName")
    .lean();
  return p?.shopName ?? null;
};

/**
 * @param {object}  options
 * @param {boolean} options.replaceCart   `?replaceCart=true` — purana cart
 *        clear karke naye vendor ka item add karo
 * @param {object}  options.serviceContext  serviceability check ke liye
 */
exports.addOrUpdateItem = async (userId, payload, options = {}) => {
  const { replaceCart = false, serviceContext } = options;
  let { productId, quantity } = payload;
  validateObjectId(productId, "Product Id");
  quantity = Math.max(Number(quantity) || 1, 1);

  const product = await Product.findOne({
    _id: productId,
    isDeleted: false,
    isActive: true,
  }).lean();
  if (!product) throwError(404, "Product not found");
  if (product.isOutOfStock || product.stockQuantity <= 0) {
    throwError(400, "Product is out of stock");
  }

  // 🔒 Customer sirf apne area ke vendor ka product add kar sakta hai
  // (listing already filter karti hai — ye defence in depth hai)
  if (serviceContext?.vendorIds) {
    const allowed = serviceContext.vendorIds.map(String);
    if (!allowed.includes(String(product.userId))) {
      throwError(
        404,
        "This product is not available in your area",
        ERROR_CODES.PRODUCT_NOT_AVAILABLE_HERE,
      );
    }
  }

  // isDeleted filter jaan-boojh ke NAHI — soft-deleted cart revive hota hai
  let cart = await Cart.findOne({ userId, isPurchased: false });

  if (!cart) {
    cart = new Cart({ userId, vendorId: product.userId, items: [] });
  }

  // ── Vendor lock ──────────────────────────────────────────
  const cartHasItems = cart.items?.length > 0 && !cart.isDeleted;
  const cartVendor = cart.vendorId;
  const vendorMismatch =
    cartVendor && String(cartVendor) !== String(product.userId);

  if (vendorMismatch && cartHasItems && !replaceCart) {
    const [currentShop, newShop] = await Promise.all([
      shopNameOf(cartVendor),
      shopNameOf(product.userId),
    ]);
    throwError(
      409,
      currentShop
        ? `Your cart has items from ${currentShop}`
        : "Your cart has items from another shop",
      ERROR_CODES.CART_VENDOR_CONFLICT,
      {
        currentVendor: { id: cartVendor, shopName: currentShop },
        newVendor: { id: product.userId, shopName: newShop },
      },
    );
  }

  if (vendorMismatch || (cart.isDeleted && cart.items?.length)) {
    // Vendor badal gaya (replaceCart) ya soft-deleted cart revive ho raha
    // hai — dono me purane items nahi rakhne.
    cart.items = [];
  }

  cart.isDeleted = false;
  cart.vendorId = product.userId;

  // ── Purane items ko revalidate karo (ek hi query me — pehle per-item
  //    findOne hota tha, N+1) ───────────────────────────────
  if (cart.items.length) {
    const ids = cart.items.map((i) => i.productId);
    const live = await Product.find({
      _id: { $in: ids },
      userId: product.userId,
      isDeleted: false,
      isActive: true,
      isOutOfStock: { $ne: true },
      stockQuantity: { $gt: 0 },
    })
      .select("generalPrice weightInKg")
      .lean();
    const byId = new Map(live.map((p) => [String(p._id), p]));

    cart.items = cart.items
      .filter((i) => byId.has(String(i.productId)))
      .map((i) => {
        const p = byId.get(String(i.productId));
        return {
          ...(i.toObject ? i.toObject() : i),
          priceSnapshot: p.generalPrice,
          productWeight: p.weightInKg,
          itemWeight: p.weightInKg * i.quantity,
        };
      });
  }

  // ── Item add / increment ─────────────────────────────────
  const index = cart.items.findIndex(
    (i) => String(i.productId) === String(productId),
  );
  if (index > -1) {
    cart.items[index].quantity += quantity;
  } else {
    cart.items.push({
      productId,
      quantity,
      productWeight: product.weightInKg,
      itemWeight: product.weightInKg * quantity,
      priceSnapshot: product.generalPrice,
    });
  }

  // Stock se zyada na ho jaye
  const finalIndex = cart.items.findIndex(
    (i) => String(i.productId) === String(productId),
  );
  if (cart.items[finalIndex].quantity > product.stockQuantity) {
    cart.items[finalIndex].quantity = product.stockQuantity;
  }
  cart.items[finalIndex].itemWeight =
    cart.items[finalIndex].productWeight * cart.items[finalIndex].quantity;

  // Cart badla → dobara verify karna padega
  cart.verifiedAt = null;
  cart.deliveryZipcode = undefined;
  cart.items.forEach((i) => {
    i.resolvedPincode = undefined;
  });

  recalcCartTotals(cart);
  return await cart.save();
};
