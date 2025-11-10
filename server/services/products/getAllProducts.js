const mongoose = require("mongoose");
const Product = require("../../models/Product");
const { pagination } = require("../../utils");

exports.getAllProducts = async (query) => {
  let {
    page,
    limit,
    search,
    name,
    brand,
    categoryId,
    subCategoryId,
    SKU,
    type,
    price,
    minPrice,
    maxPrice,
    weightInKg,
    minWeight,
    maxWeight,
    stockQuantity,
    minStock,
    maxStock,
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
  if (type) {
    type = type?.toLowerCase();
    match.type = type;
  }
  if (categoryId) match.categoryId = new mongoose.Types.ObjectId(categoryId);
  if (subCategoryId) {
    match.subCategoryId = new mongoose.Types.ObjectId(subCategoryId);
  }
  if (SKU) {
    SKU = SKU?.toUpperCase();
    match.SKU = SKU;
  }
  if (name) match.name = { $regex: new RegExp(name, "i") };
  if (brand) match.brand = { $regex: new RegExp(brand, "i") };
  if (search) {
    match.$or = [
      { name: { $regex: new RegExp(search, "i") } },
      { brand: { $regex: new RegExp(search, "i") } },
      { description: { $regex: new RegExp(search, "i") } },
      { SKU: { $regex: new RegExp(search, "i") } },
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
  if (price) match.generalPrice = price;
  else if (minPrice || maxPrice) {
    match.generalPrice = {};
    if (minPrice) match.generalPrice.$gte = Number(minPrice);
    if (maxPrice) match.generalPrice.$lte = Number(maxPrice);
  }
  if (weightInKg) match.weightInKg = weightInKg;
  else if (minWeight || maxWeight) {
    match.weightInKg = {};
    if (minWeight) match.weightInKg.$gte = Number(minWeight);
    if (maxWeight) match.weightInKg.$lte = Number(maxWeight);
  }
  if (stockQuantity) match.stockQuantity = stockQuantity;
  else if (minStock || maxStock) {
    match.stockQuantity = {};
    if (minStock) match.stockQuantity.$gte = Number(minStock);
    if (maxStock) match.stockQuantity.$lte = Number(maxStock);
  }
  const pipeline = [{ $match: match }];
  pipeline.push({
    $project: {
      name: 1,
      brand: 1,
      categoryId: 1,
      subCategoryId: 1,
      generalPrice: 1,
      stockQuantity: 1,
      SKU: 1,
      weightInKg: 1,
      description: 1,
      image: 1,
      type: 1,
      isActive: 1,
      createdAt: 1,
    },
  });
  const sortStage = {};
  sortStage[sortBy] = sortOrder === "asc" ? 1 : -1;
  pipeline.push({ $sort: sortStage });
  return await pagination(Product, pipeline, page, limit);
};
