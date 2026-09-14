const Cart = require("../../models/Cart");
const Location = require("../../models/Location");
const Product = require("../../models/Product");
const VendorProfile = require("../../models/VendorProfile");
const VendorServiceArea = require("../../models/VendorServiceArea");
const { ERROR_CODES } = require("../../constants");
const { throwError } = require("../../utils");
const { recalcCartTotals } = require("./recalcCartTotals");

/**
 * Checkout se pehle ka final gate:
 *   1. cart ka vendor is pincode pe deliver karta hai?
 *   2. har item abhi bhi available hai? stock kaafi hai?
 *   3. price badla to nahi?
 *
 * @param {object} payload  `{ locationId }` prefer karo — server usi se
 *        zipcode nikalta hai. `{ zipcode }` bhi chalta hai (address save
 *        karne se pehle wala flow), par order place pe fir se `locationId`
 *        se hi verify hota hai.
 */
exports.verifyCartByPincode = async (userId, payload) => {
  const { locationId } = payload;
  let zipcode = payload.zipcode ? String(payload.zipcode).trim() : undefined;

  if (locationId) {
    const loc = await Location.findOne({
      _id: locationId,
      userId,
      isDeleted: false,
    })
      .select("zipcode")
      .lean();
    if (!loc) throwError(404, "Delivery address not found");
    zipcode = loc.zipcode;
  }
  if (!zipcode) {
    throwError(
      400,
      "Please select a delivery location",
      ERROR_CODES.PINCODE_REQUIRED,
    );
  }

  const cart = await Cart.findOne({
    userId,
    isPurchased: false,
    isDeleted: false,
  });
  if (!cart || !cart.items.length) {
    throwError(400, "Cart is empty or not found");
  }
  if (!cart.vendorId) {
    throwError(400, "Cart is not linked to a shop — please rebuild your cart");
  }

  // ── 1. Vendor is pincode pe deliver karta hai? ───────────
  const [area, profile] = await Promise.all([
    VendorServiceArea.findOne({
      zipcode,
      vendorId: cart.vendorId,
      isActive: true,
      isDeleted: false,
    })
      .select("minOrderAmount etaMinutes")
      .lean(),
    VendorProfile.findOne({ vendorId: cart.vendorId })
      .select("shopName delivery")
      .lean(),
  ]);

  if (!area) {
    throwError(
      400,
      `${profile?.shopName || "This shop"} does not deliver to ${zipcode}`,
      ERROR_CODES.VENDOR_NOT_SERVICEABLE,
      { zipcode, vendorId: cart.vendorId, shopName: profile?.shopName ?? null },
    );
  }

  // `computeOrderPricing` ke saath same precedence — warna verify pass hoke
  // order place pe fail ho jata.
  const minOrderAmount = Number(
    area.minOrderAmount ?? profile?.delivery?.minOrderAmount ?? 0,
  );

  // ── 2 & 3. Items — price/stock ka single source `Product` hai ──
  const ids = cart.items.map((i) => i.productId);
  const products = await Product.find({
    _id: { $in: ids },
    userId: cart.vendorId,
    isDeleted: false,
    isActive: true,
  })
    .select("name generalPrice stockQuantity weightInKg isOutOfStock")
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const unavailableItems = [];
  const priceChanged = [];

  for (const item of cart.items) {
    const p = byId.get(String(item.productId));
    if (!p || p.isOutOfStock || p.stockQuantity <= 0) {
      unavailableItems.push({
        productId: item.productId,
        name: p?.name ?? null,
        reason: "No longer available",
      });
      continue;
    }
    if (item.quantity > p.stockQuantity) {
      unavailableItems.push({
        productId: item.productId,
        name: p.name,
        reason: `Only ${p.stockQuantity} available`,
        available: p.stockQuantity,
      });
      continue;
    }
    if (item.priceSnapshot !== p.generalPrice) {
      priceChanged.push({
        productId: item.productId,
        name: p.name,
        oldPrice: item.priceSnapshot,
        newPrice: p.generalPrice,
      });
      item.priceSnapshot = p.generalPrice;
    }
    item.productWeight = p.weightInKg;
    item.itemWeight = p.weightInKg * item.quantity;
    item.resolvedPincode = zipcode;
  }

  if (unavailableItems.length) {
    // Cart save nahi kar rahe — customer pehle ye items hataye/adjust kare
    return { status: "FAILED", zipcode, unavailableItems };
  }

  recalcCartTotals(cart);

  // Min-order check `verifiedAt` set karne se PEHLE — warna cart "verified"
  // mark ho jata aur checkout pe jaake fail hota.
  if (minOrderAmount && cart.subTotal < minOrderAmount) {
    throwError(
      400,
      `Minimum order amount is ₹${minOrderAmount}`,
      ERROR_CODES.MIN_ORDER_NOT_MET,
      { minOrderAmount, subTotal: cart.subTotal },
    );
  }

  cart.deliveryZipcode = zipcode;
  cart.verifiedAt = new Date();
  await cart.save();

  if (priceChanged.length) {
    return {
      status: "PRICE_CHANGED",
      zipcode,
      priceChanged,
      subTotal: cart.subTotal,
      etaMinutes: area.etaMinutes ?? null,
    };
  }
  return {
    status: "OK",
    zipcode,
    subTotal: cart.subTotal,
    etaMinutes: area.etaMinutes ?? null,
  };
};
