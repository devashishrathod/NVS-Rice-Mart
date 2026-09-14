const mongoose = require("mongoose");
const Product = require("../../models/Product");
const { ERROR_CODES } = require("../../constants");
const { throwError } = require("../../utils");

/**
 * @param {string} productId
 * @param {object} [serviceContext] pass karne pe serviceability check lagta hai
 */
exports.getProduct = async (productId, serviceContext) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) return null;
  const match = {
    _id: new mongoose.Types.ObjectId(productId),
    isDeleted: false,
  };
  // Customer ko inactive product nahi dikhna chahiye
  if (serviceContext?.activeOnly) match.isActive = true;

  const pipeline = [
    { $match: match },
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
        userId: 1,
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
  if (!product) return null;

  // 🔒 Serviceability — product exist karta hai par customer ke area ka
  // vendor iska owner nahi. Deep-link / share-link pe ye case aayega.
  if (serviceContext?.vendorIds) {
    const allowed = serviceContext.vendorIds.map(String);
    if (!allowed.includes(String(product.userId))) {
      throwError(
        404,
        "This product is not available in your area",
        ERROR_CODES.PRODUCT_NOT_AVAILABLE_HERE,
      );
    }
  }
  return product;
};
