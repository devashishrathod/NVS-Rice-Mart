const Order = require("../../models/Order");
const { pagination, throwError, escapeRegex } = require("../../utils");
const { buildOrderPipeline, toObjectId } = require("./orderAggregation");
const { buildOrderScope } = require("./assertOrderAccess");

/**
 * @param {object} query  request query
 * @param {{ userId: any, role: string }} actor  logged-in user — iske bina
 *        scoping nahi lagti, isliye ye REQUIRED hai.
 */
exports.getAllOrders = async (query, actor) => {
  let {
    page,
    limit,
    sortBy = "createdAt",
    sortOrder = "desc",
    fromDate,
    toDate,
    orderId,
    userId,
    vendorId,
    cartId,
    locationId,
    paymentMethod,
    status,
    paymentStatus,
    razorpayOrderId,
    deliveryPincode,
    orderNumber,
    minPayableAmount,
    maxPayableAmount,
    minSubTotal,
    maxSubTotal,
    minDeliveryCharge,
    maxDeliveryCharge,
    minDistanceKm,
    maxDistanceKm,
    search,
  } = query;

  page = page ? Number(page) : 1;
  limit = limit ? Number(limit) : 10;

  const match = {};

  const oid = toObjectId(orderId);
  if (oid) match._id = oid;

  // Sirf admin/staff hi doosron ke orders filter kar sakte hain. Customer/vendor
  // ke liye ye params neeche scope se overwrite ho jayenge.
  const uoid = toObjectId(userId);
  if (uoid) match.userId = uoid;

  const void_ = toObjectId(vendorId);
  if (void_) match.vendorId = void_;

  if (orderNumber) {
    match.orderNumber = { $regex: new RegExp(escapeRegex(orderNumber), "i") };
  }

  const coid = toObjectId(cartId);
  if (coid) match.cartId = coid;

  const loid = toObjectId(locationId);
  if (loid) match.locationId = loid;

  if (paymentMethod) match.paymentMethod = paymentMethod;
  if (status) match.status = status;
  if (paymentStatus) match.paymentStatus = paymentStatus;
  if (razorpayOrderId) {
    match.razorpayOrderId = { $regex: new RegExp(escapeRegex(razorpayOrderId), "i") };
  }
  if (deliveryPincode) {
    match.deliveryPincode = { $regex: new RegExp(escapeRegex(deliveryPincode), "i") };
  }

  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const d = new Date(toDate);
      d.setHours(23, 59, 59, 999);
      match.createdAt.$lte = d;
    }
  }

  if (minPayableAmount || maxPayableAmount) {
    match.payableAmount = {};
    if (minPayableAmount !== undefined)
      match.payableAmount.$gte = Number(minPayableAmount);
    if (maxPayableAmount !== undefined)
      match.payableAmount.$lte = Number(maxPayableAmount);
  }

  if (minSubTotal || maxSubTotal) {
    match.subTotal = {};
    if (minSubTotal !== undefined) match.subTotal.$gte = Number(minSubTotal);
    if (maxSubTotal !== undefined) match.subTotal.$lte = Number(maxSubTotal);
  }

  if (minDeliveryCharge || maxDeliveryCharge) {
    match.deliveryCharge = {};
    if (minDeliveryCharge !== undefined)
      match.deliveryCharge.$gte = Number(minDeliveryCharge);
    if (maxDeliveryCharge !== undefined)
      match.deliveryCharge.$lte = Number(maxDeliveryCharge);
  }

  if (minDistanceKm || maxDistanceKm) {
    match.distanceKm = {};
    if (minDistanceKm !== undefined) match.distanceKm.$gte = Number(minDistanceKm);
    if (maxDistanceKm !== undefined) match.distanceKm.$lte = Number(maxDistanceKm);
  }

  // 🔒 Role scoping SABSE AAKHIR me — taaki client ka koi bhi query param
  // ise override na kar sake. Customer sirf apne, vendor sirf apne orders.
  const scope = buildOrderScope(actor);
  if (!scope) throwError(401, "Access Denied! Missing user context");
  Object.assign(match, scope);

  const sortStage = {};
  sortStage[sortBy] = sortOrder === "asc" ? 1 : -1;

  const pipeline = buildOrderPipeline({ match, sortStage });

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    pipeline.splice(3, 0, {
      $match: {
        $or: [
          { "user.name": { $regex: regex } },
          { "user.email": { $regex: regex } },
          { "user.mobile": { $regex: regex } },
          { razorpayOrderId: { $regex: regex } },
          { deliveryPincode: { $regex: regex } },
        ],
      },
    });
  }

  return await pagination(Order, pipeline, page, limit);
};
