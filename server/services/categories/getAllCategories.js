const mongoose = require("mongoose");
const Category = require("../../models/Category");
const { pagination, escapeRegex } = require("../../utils");
const { applyServiceScope } = require("../serviceAreas/applyServiceScope");

/**
 * @param {object} query
 * @param {object} serviceContext  `attachServiceContext` se — customer ke liye
 *        uske pincode ka vendor, vendor ke liye khud, admin ke liye sab.
 */
exports.getAllCategories = async (query, serviceContext) => {
  let {
    page,
    limit,
    search,
    name,
    userId,
    isActive,
    fromDate,
    toDate,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;
  page = page ? Number(page) : 1;
  limit = limit ? Number(limit) : 10;
  const match = { isDeleted: false };
  if (typeof isActive !== "undefined") {
    match.isActive = isActive === "true" || isActive === true;
  }
  // Customer ke liye ye scope se overwrite ho jayega (neeche)
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    match.userId = new mongoose.Types.ObjectId(userId);
  }
  if (name) match.name = { $regex: new RegExp(escapeRegex(name), "i") };
  if (search) {
    match.$or = [
      { name: { $regex: new RegExp(escapeRegex(search), "i") } },
      { description: { $regex: new RegExp(escapeRegex(search), "i") } },
    ];
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
  // 🔒 Scope SABSE AAKHIR me — client ka `userId` param ise override na kare
  applyServiceScope(match, serviceContext);

  const pipeline = [{ $match: match }];
  pipeline.push({
    $project: {
      userId: 1,
      name: 1,
      description: 1,
      image: 1,
      isActive: 1,
      createdAt: 1,
    },
  });
  const sortStage = {};
  sortStage[sortBy] = sortOrder === "asc" ? 1 : -1;
  pipeline.push({ $sort: sortStage });

  // Customer ke liye khali list koi error nahi hai — 404 sirf
  // "pincode serve nahi hota" ke liye reserve hai.
  return await pagination(Category, pipeline, page, limit, {
    throwOnEmpty: serviceContext?.mode !== "CUSTOMER",
  });
};
