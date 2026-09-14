const Location = require("../../models/Location");
const Product = require("../../models/Product");
const Setting = require("../../models/Setting");
const VendorProfile = require("../../models/VendorProfile");
const VendorServiceArea = require("../../models/VendorServiceArea");
const {
  ERROR_CODES,
  LOCATION_TYPES,
  DELIVERY_SETTINGS,
  VENDOR_STATUS,
} = require("../../constants");
const { throwError } = require("../../utils");
const { calculateDistanceInKm } = require("./calculateDistanceInKm");
const { calculateDeliveryCharges } = require("./calculateDeliveryCharges");

const hasCoords = (c) =>
  Array.isArray(c) && c.length === 2 && Number(c[0]) && Number(c[1]);

const pruneUndefined = (obj = {}) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null),
  );

/**
 * Order ka poora pricing — `preview` aur `placeOrder` DONO yahi call karte
 * hain, taaki checkout screen ka total aur actual order ka total kabhi
 * mismatch na ho.
 *
 * Koi write nahi karta.
 */
exports.computeOrderPricing = async ({ userId, cart, locationId }) => {
  // ── 1. Customer ka delivery address (server se, client se nahi) ──
  const userLocation = await Location.findOne({
    _id: locationId,
    userId,
    isDeleted: false,
  }).lean();
  if (!userLocation || !userLocation.zipcode) {
    throwError(404, "Incorrect user location! Delivery address not found");
  }
  if (!hasCoords(userLocation.coordinates)) {
    throwError(422, "Your delivery address has no map location — please re-add it");
  }

  if (!cart?.vendorId) {
    throwError(400, "Cart is not linked to a shop — please rebuild your cart");
  }

  // ── 2. Vendor is pincode pe deliver karta hai? ───────────
  const area = await VendorServiceArea.findOne({
    zipcode: userLocation.zipcode,
    vendorId: cart.vendorId,
    isActive: true,
    isDeleted: false,
  }).lean();

  const profile = await VendorProfile.findOne({
    vendorId: cart.vendorId,
    status: VENDOR_STATUS.APPROVED,
    isDeleted: false,
  }).lean();

  if (!area || !profile) {
    throwError(
      400,
      `${profile?.shopName || "This shop"} does not deliver to ${userLocation.zipcode}`,
      ERROR_CODES.VENDOR_NOT_SERVICEABLE,
      { zipcode: userLocation.zipcode },
    );
  }

  // ── 3. Pickup = vendor ka DEFAULT branch (hamesha) ───────
  const pickup = await Location.findOne({
    _id: profile.defaultLocationId,
    userId: cart.vendorId,
    type: LOCATION_TYPES.VENDOR_BRANCH,
    isDeleted: false,
  }).lean();

  if (!pickup || !hasCoords(pickup.coordinates)) {
    throwError(
      503,
      "This shop cannot accept orders right now",
      ERROR_CODES.VENDOR_PICKUP_MISSING,
      { vendorId: cart.vendorId },
    );
  }

  const distanceKm = calculateDistanceInKm(
    pickup.coordinates[0],
    pickup.coordinates[1],
    userLocation.coordinates[0],
    userLocation.coordinates[1],
  );

  // ── 4. Radius — vendor apna chhota set kar sakta hai, global hard cap ──
  const setting = await Setting.findOne().lean();
  const parsedGlobal = Number(
    setting?.delivery?.maxRadiusKm ?? DELIVERY_SETTINGS.MAX_RADIUS_KM,
  );
  const globalRadius = Number.isFinite(parsedGlobal)
    ? parsedGlobal
    : DELIVERY_SETTINGS.MAX_RADIUS_KM;
  const vendorRadius = Number(profile.delivery?.maxRadiusKm);
  // Vendor global se upar nahi ja sakta — chhota kar sakta hai
  const maxRadiusKm =
    Number.isFinite(vendorRadius) && vendorRadius > 0
      ? Math.min(vendorRadius, globalRadius)
      : globalRadius;
  if (distanceKm > maxRadiusKm) {
    throwError(
      400,
      `Delivery not available beyond ${maxRadiusKm} km`,
      ERROR_CODES.OUT_OF_RADIUS,
      { distanceKm: +distanceKm.toFixed(2), maxRadiusKm },
    );
  }

  // ── 5. Items ki fresh pricing (single source = Product) ──
  const ids = cart.items.map((i) => i.productId);
  const products = await Product.find({
    _id: { $in: ids },
    userId: cart.vendorId,
    isDeleted: false,
    isActive: true,
  })
    .select("name brand SKU image generalPrice stockQuantity weightInKg isOutOfStock")
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const unavailableItems = [];
  const items = [];
  let subTotal = 0;
  let totalWeight = 0;

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
    subTotal += p.generalPrice * item.quantity;
    totalWeight += (p.weightInKg || 0) * item.quantity;
    items.push({
      productId: p._id,
      quantity: item.quantity,
      price: p.generalPrice,
      productSnapshot: {
        name: p.name,
        brand: p.brand,
        SKU: p.SKU,
        image: p.image,
        weightInKg: p.weightInKg,
      },
    });
  }

  if (unavailableItems.length) {
    throwError(
      409,
      "Some items in your cart are no longer available",
      ERROR_CODES.STOCK_UNAVAILABLE,
      { unavailableItems },
    );
  }

  // ── 6. Delivery charge ───────────────────────────────────
  // Config precedence: VendorServiceArea → VendorProfile.delivery.
  // Vendor ne kuch set hi nahi kiya to charge ₹0 (aaj jaisa behaviour).
  const deliveryConf = {
    ...pruneUndefined(profile.delivery),
    ...pruneUndefined({
      minOrderAmount: area.minOrderAmount,
      freeDeliveryAbove: area.freeDeliveryAbove,
      deliveryChargeOverride: area.deliveryChargeOverride,
    }),
  };

  const minOrderAmount = Number(deliveryConf.minOrderAmount ?? 0);
  if (minOrderAmount && subTotal < minOrderAmount) {
    throwError(
      400,
      `Minimum order amount is ₹${minOrderAmount}`,
      ERROR_CODES.MIN_ORDER_NOT_MET,
      { minOrderAmount, subTotal },
    );
  }

  // 🔑 MASTER SWITCH — vendor ne delivery charge on hi nahi kiya to ₹0,
  //    chahe baaki values bhari hon, chahe admin ne per-pincode override
  //    set kiya ho.
  let deliveryCharge = 0;
  const chargeEnabled = deliveryConf.isEnabled === true;

  if (chargeEnabled) {
    deliveryCharge =
      deliveryConf.deliveryChargeOverride !== undefined &&
      deliveryConf.deliveryChargeOverride !== null
        ? Number(deliveryConf.deliveryChargeOverride)
        : calculateDeliveryCharges(totalWeight, distanceKm, deliveryConf);

    // Platform hard cap — vendor isse zyada nahi laga sakta
    const parsedCap = Number(
      setting?.delivery?.maxAllowedDeliveryCharge ??
        DELIVERY_SETTINGS.MAX_ALLOWED_DELIVERY_CHARGE,
    );
    if (Number.isFinite(parsedCap) && parsedCap > 0) {
      deliveryCharge = Math.min(deliveryCharge, parsedCap);
    }
  }

  const freeAbove = Number(deliveryConf.freeDeliveryAbove ?? 0);
  const freeDeliveryApplied = !!(
    chargeEnabled &&
    freeAbove &&
    subTotal >= freeAbove
  );
  if (freeDeliveryApplied) deliveryCharge = 0;

  return {
    userLocation,
    pickup,
    profile,
    area,
    items,
    subTotal,
    totalWeight,
    distanceKm: +distanceKm.toFixed(2),
    deliveryCharge,
    payableAmount: subTotal + deliveryCharge,
    freeDeliveryAbove: freeAbove || null,
    freeDeliveryApplied,
    minOrderAmount,
    etaMinutes: area.etaMinutes ?? null,
    vendor: { id: cart.vendorId, shopName: profile.shopName, logo: profile.logo },
  };
};
