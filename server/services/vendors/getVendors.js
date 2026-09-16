const mongoose = require("mongoose");
const VendorProfile = require("../../models/VendorProfile");
const { LOCATION_TYPES } = require("../../constants");
const { pagination, throwError, validateObjectId, escapeRegex } = require("../../utils");

/**
 * Counts ko `$lookup` + `$size` se nikal rahe hain. Vendors ki sankhya chhoti
 * rehti hai (dozens, thousands nahi), isliye ye theek hai. Agar kabhi vendors
 * bahut badh jayein to counts ko denormalize karna padega.
 */
const withCounts = () => [
  {
    $lookup: {
      from: "users",
      localField: "vendorId",
      foreignField: "_id",
      as: "vendor",
    },
  },
  { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: "vendorserviceareas",
      let: { vid: "$vendorId" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$vendorId", "$$vid"] },
            isDeleted: false,
          },
        },
        { $project: { zipcode: 1, isActive: 1 } },
      ],
      as: "serviceAreas",
    },
  },
  {
    $lookup: {
      from: "locations",
      let: { vid: "$vendorId" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$userId", "$$vid"] },
            type: LOCATION_TYPES.VENDOR_BRANCH,
            isDeleted: false,
          },
        },
        { $project: { zipcode: 1, city: 1, isDefault: 1, coordinates: 1 } },
      ],
      as: "branches",
    },
  },
  {
    $lookup: {
      from: "orders",
      let: { vid: "$vendorId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$vendorId", "$$vid"] } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: {
              $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
            },
            revenue: {
              $sum: {
                $cond: [{ $eq: ["$status", "DELIVERED"] }, "$payableAmount", 0],
              },
            },
          },
        },
      ],
      as: "orderStats",
    },
  },
  {
    $addFields: {
      serviceAreaCount: { $size: "$serviceAreas" },
      branchCount: { $size: "$branches" },
      orderCount: { $ifNull: [{ $first: "$orderStats.total" }, 0] },
      pendingOrderCount: { $ifNull: [{ $first: "$orderStats.pending" }, 0] },
      deliveredRevenue: { $ifNull: [{ $first: "$orderStats.revenue" }, 0] },
      zipcodes: "$serviceAreas.zipcode",
    },
  },
  {
    $project: {
      shopName: 1,
      legalName: 1,
      gstNumber: 1,
      fssaiNumber: 1,
      logo: 1,
      supportMobile: 1,
      status: 1,
      commissionPercent: 1,
      defaultLocationId: 1,
      delivery: 1,
      createdAt: 1,
      updatedAt: 1,
      vendor: {
        _id: 1,
        name: 1,
        email: 1,
        mobile: 1,
        role: 1,
        isActive: 1,
        isDeleted: 1,
      },
      branches: 1,
      zipcodes: 1,
      serviceAreaCount: 1,
      branchCount: 1,
      orderCount: 1,
      pendingOrderCount: 1,
      deliveredRevenue: 1,
    },
  },
];

exports.getAllVendors = async (query = {}) => {
  const page = query.page ? Number(query.page) : 1;
  const limit = query.limit ? Number(query.limit) : 10;

  const match = { isDeleted: false };
  if (query.status) match.status = query.status;
  if (query.shopName) match.shopName = { $regex: new RegExp(escapeRegex(query.shopName), "i") };

  const pipeline = [{ $match: match }, ...withCounts()];

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    pipeline.push({
      $match: {
        $or: [
          { shopName: { $regex: regex } },
          { "vendor.name": { $regex: regex } },
          { "vendor.email": { $regex: regex } },
          { "vendor.mobile": { $regex: regex } },
          { zipcodes: { $regex: regex } },
        ],
      },
    });
  }
  if (query.zipcode) {
    pipeline.push({ $match: { zipcodes: String(query.zipcode).trim() } });
  }

  const sortBy = query.sortBy || "createdAt";
  const sortOrder = query.sortOrder === "asc" ? 1 : -1;
  pipeline.push({ $sort: { [sortBy]: sortOrder } });

  return await pagination(VendorProfile, pipeline, page, limit, {
    throwOnEmpty: false,
  });
};

exports.getVendor = async (vendorId) => {
  validateObjectId(vendorId, "Vendor Id");
  const pipeline = [
    {
      $match: {
        vendorId: new mongoose.Types.ObjectId(vendorId),
        isDeleted: false,
      },
    },
    ...withCounts(),
  ];
  const [profile] = await VendorProfile.aggregate(pipeline);
  if (!profile) throwError(404, "Vendor not found");
  return profile;
};
