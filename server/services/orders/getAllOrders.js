const Order = require("../../models/Order");
const { pagination } = require("../../utils");
const { buildOrderPipeline, toObjectId } = require("./orderAggregation");

exports.getAllOrders = async (query) => {
  let {
    page,
    limit,
    sortBy = "createdAt",
    sortOrder = "desc",
    fromDate,
    toDate,
    orderId,
    userId,
    cartId,
    locationId,
    paymentMethod,
    status,
    paymentStatus,
    razorpayOrderId,
    deliveryPincode,
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

  const uoid = toObjectId(userId);
  if (uoid) match.userId = uoid;

  const coid = toObjectId(cartId);
  if (coid) match.cartId = coid;

  const loid = toObjectId(locationId);
  if (loid) match.locationId = loid;

  if (paymentMethod) match.paymentMethod = paymentMethod;
  if (status) match.status = status;
  if (paymentStatus) match.paymentStatus = paymentStatus;
  if (razorpayOrderId) {
    match.razorpayOrderId = { $regex: new RegExp(razorpayOrderId, "i") };
  }
  if (deliveryPincode) {
    match.deliveryPincode = { $regex: new RegExp(deliveryPincode, "i") };
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

  const sortStage = {};
  sortStage[sortBy] = sortOrder === "asc" ? 1 : -1;

  const pipeline = buildOrderPipeline({ match, sortStage });

  if (search) {
    const regex = new RegExp(search, "i");
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
