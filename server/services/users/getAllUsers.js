const mongoose = require("mongoose");
const User = require("../../models/User");
const { pagination, escapeRegex } = require("../../utils");

exports.getAllUsers = async (query) => {
  let {
    page,
    limit,
    search,
    name,
    email,
    mobile,
    role,
    isActive,
    fromDate,
    toDate,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;
  page = page ? Number(page) : 1;
  limit = limit ? Number(limit) : 10;
  const match = { role: { $ne: "admin" }, isDeleted: false };
  if (typeof isActive !== "undefined") {
    match.isActive = isActive === "true" || isActive === true;
  }
  if (role) match.role = role;
  if (name) match.name = { $regex: new RegExp(escapeRegex(name), "i") };
  if (email) match.email = { $regex: new RegExp(escapeRegex(email), "i") };
  if (mobile) match.mobile = { $regex: new RegExp(escapeRegex(mobile), "i") };
  if (search) {
    match.$or = [
      { name: { $regex: new RegExp(escapeRegex(search), "i") } },
      { email: { $regex: new RegExp(escapeRegex(search), "i") } },
      { mobile: { $regex: new RegExp(escapeRegex(search), "i") } },
      // `address` field User se hata diya gaya — address `Location` me hai
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

  // Aggregation schema ke `select: false` ko bypass karti hai, isliye
  // password hash aur OTP yahan explicitly hatane padte hain — warna
  // admin ko har user ka bcrypt hash chala jata tha.
  const pipeline = [{ $match: match }, { $unset: ["password", "otp"] }];
  const sortStage = {};
  sortStage[sortBy] = sortOrder === "asc" ? 1 : -1;
  pipeline.push({ $sort: sortStage });
  return await pagination(User, pipeline, page, limit);
};
