const mongoose = require("mongoose");
const SubCategory = require("../../models/SubCategory");
const { pagination, escapeRegex } = require("../../utils");
const { applyServiceScope } = require("../serviceAreas/applyServiceScope");

exports.getAllSubCategories = async (query, serviceContext) => {
  let {
    page,
    limit,
    search,
    name,
    isActive,
    fromDate,
    toDate,
    categoryId,
    userId,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;
  page = page ? Number(page) : 1;
  limit = limit ? Number(limit) : 10;
  const match = { isDeleted: false };
  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
    match.categoryId = new mongoose.Types.ObjectId(categoryId);
  }
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    match.userId = new mongoose.Types.ObjectId(userId);
  }
  if (typeof isActive !== "undefined") {
    match.isActive = isActive === "true" || isActive === true;
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
  // 🔒 Scope sabse aakhir me
  applyServiceScope(match, serviceContext);

  const pipeline = [{ $match: match }];
  pipeline.push({
    $project: {
      userId: 1,
      name: 1,
      description: 1,
      image: 1,
      categoryId: 1,
      isActive: 1,
      isDeleted: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  });
  const sortStage = {};
  sortStage[sortBy] = sortOrder === "asc" ? 1 : -1;
  pipeline.push({ $sort: sortStage });
  return await pagination(SubCategory, pipeline, page, limit, {
    throwOnEmpty: serviceContext?.mode !== "CUSTOMER",
  });
};
