const mongoose = require("mongoose");
const Product = require("../../models/Product");

exports.getProduct = async (productId) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) return null;
  const pipeline = [
    {
      $match: { _id: new mongoose.Types.ObjectId(productId), isDeleted: false },
    },
    {
      $lookup: {
        from: "categories",
        localField: "categoryId",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "subcategories",
        localField: "subCategoryId",
        foreignField: "_id",
        as: "subCategory",
      },
    },
    { $unwind: { path: "$subCategory", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        name: 1,
        brand: 1,
        description: 1,
        generalPrice: 1,
        stockQuantity: 1,
        SKU: 1,
        weightInKg: 1,
        image: 1,
        type: 1,
        isActive: 1,
        createdAt: 1,
        updatedAt: 1,
        category: {
          _id: "$category._id",
          name: "$category.name",
          description: "$category.description",
          image: "$category.image",
          isActive: "$category.isActive",
        },
        subCategory: {
          _id: "$subCategory._id",
          name: "$subCategory.name",
          description: "$subCategory.description",
          image: "$subCategory.image",
          isActive: "$subCategory.isActive",
        },
      },
    },
  ];
  const [product] = await Product.aggregate(pipeline);
  return product || null;
};
