const mongoose = require("mongoose");
const Order = require("../../models/Order");
const VendorProfile = require("../../models/VendorProfile");
const { ORDER_STATUS, ROLES } = require("../../constants");
const { throwError } = require("../../utils");

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const S = ORDER_STATUS;

/** Vendor dashboard — ek hi aggregation me saare counts. */
exports.getVendorSummary = async (vendorId) => {
  const today = startOfToday();
  const month = startOfMonth();
  const vid = new mongoose.Types.ObjectId(vendorId);

  const [row] = await Order.aggregate([
    { $match: { vendorId: vid } },
    {
      $group: {
        _id: null,
        pending: { $sum: { $cond: [{ $eq: ["$status", S.PENDING] }, 1, 0] } },
        accepted: { $sum: { $cond: [{ $eq: ["$status", S.ACCEPTED] }, 1, 0] } },
        packed: { $sum: { $cond: [{ $eq: ["$status", S.PACKED] }, 1, 0] } },
        outForDelivery: {
          $sum: { $cond: [{ $eq: ["$status", S.OUT_FOR_DELIVERY] }, 1, 0] },
        },
        deliveredToday: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", S.DELIVERED] },
                  { $gte: ["$updatedAt", today] },
                ],
              },
              1,
              0,
            ],
          },
        },
        cancelledToday: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ["$status", [S.CANCELLED, S.REJECTED]] },
                  { $gte: ["$updatedAt", today] },
                ],
              },
              1,
              0,
            ],
          },
        },
        revenueToday: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", S.DELIVERED] },
                  { $gte: ["$updatedAt", today] },
                ],
              },
              "$payableAmount",
              0,
            ],
          },
        },
        revenueThisMonth: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", S.DELIVERED] },
                  { $gte: ["$updatedAt", month] },
                ],
              },
              "$payableAmount",
              0,
            ],
          },
        },
        totalOrders: { $sum: 1 },
        lifetimeRevenue: {
          $sum: {
            $cond: [{ $eq: ["$status", S.DELIVERED] }, "$payableAmount", 0],
          },
        },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return (
    row ?? {
      pending: 0,
      accepted: 0,
      packed: 0,
      outForDelivery: 0,
      deliveredToday: 0,
      cancelledToday: 0,
      revenueToday: 0,
      revenueThisMonth: 0,
      totalOrders: 0,
      lifetimeRevenue: 0,
    }
  );
};

/** Admin oversight — vendor-wise breakdown (read-only). */
exports.getAdminSummary = async (actor) => {
  if (actor.role !== ROLES.ADMIN && actor.role !== ROLES.STAFF) {
    throwError(403, "Forbidden");
  }
  const today = startOfToday();

  const rows = await Order.aggregate([
    {
      $group: {
        _id: "$vendorId",
        totalOrders: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ["$status", S.PENDING] }, 1, 0] } },
        delivered: { $sum: { $cond: [{ $eq: ["$status", S.DELIVERED] }, 1, 0] } },
        cancelled: {
          $sum: { $cond: [{ $in: ["$status", [S.CANCELLED, S.REJECTED]] }, 1, 0] },
        },
        ordersToday: { $sum: { $cond: [{ $gte: ["$createdAt", today] }, 1, 0] } },
        revenue: {
          $sum: {
            $cond: [{ $eq: ["$status", S.DELIVERED] }, "$payableAmount", 0],
          },
        },
      },
    },
    { $sort: { totalOrders: -1 } },
  ]);

  const vendorIds = rows.map((r) => r._id).filter(Boolean);
  const profiles = await VendorProfile.find({ vendorId: { $in: vendorIds } })
    .select("vendorId shopName status")
    .lean();
  const byVendor = new Map(profiles.map((p) => [String(p.vendorId), p]));

  const vendors = rows.map((r) => ({
    vendorId: r._id,
    shopName: byVendor.get(String(r._id))?.shopName ?? null,
    status: byVendor.get(String(r._id))?.status ?? null,
    totalOrders: r.totalOrders,
    pending: r.pending,
    delivered: r.delivered,
    cancelled: r.cancelled,
    ordersToday: r.ordersToday,
    revenue: r.revenue,
  }));

  const totals = vendors.reduce(
    (acc, v) => ({
      totalOrders: acc.totalOrders + v.totalOrders,
      pending: acc.pending + v.pending,
      delivered: acc.delivered + v.delivered,
      cancelled: acc.cancelled + v.cancelled,
      ordersToday: acc.ordersToday + v.ordersToday,
      revenue: acc.revenue + v.revenue,
    }),
    { totalOrders: 0, pending: 0, delivered: 0, cancelled: 0, ordersToday: 0, revenue: 0 },
  );

  return { totals, vendors };
};
