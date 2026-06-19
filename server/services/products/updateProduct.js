const Product = require("../../models/Product");
const SubCategory = require("../../models/SubCategory");
const { generateSKU } = require("../../helpers/products");
const { throwError, validateObjectId } = require("../../utils");
const { uploadImage, deleteImage } = require("../uploads");
const { PRODUCT_TYPES } = require("../../constants");

exports.updateProduct = async (productId, payload, image) => {
  const product = await Product.findById(productId);
  if (!product || product.isDeleted) throwError(404, "Product not found!");
  const updatedData = {};
  if (payload) {
    let {
      name,
      brand,
      description,
      type,
      generalPrice,
      stockQuantity,
      subCategoryId,
      weightInKg,
      isOutOfStock,
      isActive,
    } = payload;
    let subCategory = await SubCategory.findOne({
      _id: product.subCategoryId,
      isDeleted: false,
    });
    if (subCategoryId) {
      validateObjectId(subCategoryId, "subcategory Id");
      updatedSubCategory = await SubCategory.findOne({
        _id: subCategoryId,
        isDeleted: false,
      });
      if (!updatedSubCategory) throwError(404, "Sub Category not found");
      subCategory = updatedSubCategory;
      updatedData.subCategoryId = subCategoryId;
    }
    if (name) {
      name = name?.toLowerCase();
      updatedData.name = name;
    }
    if (brand) {
      brand = brand?.toLowerCase();
      updatedData.brand = brand;
    }
    if (type) {
      type = type?.toLowerCase() || PRODUCT_TYPES.GROCERY;
      updatedData.type = type;
    }
    if (description) {
      description = description?.toLowerCase();
      updatedData.description = description;
    }
    if (generalPrice) updatedData.generalPrice = generalPrice;
    if (stockQuantity) updatedData.stockQuantity = stockQuantity;
    if (weightInKg) updatedData.weightInKg = weightInKg;
    if (isOutOfStock !== undefined) updatedData.isOutOfStock = isOutOfStock;
    if (isActive !== undefined) updatedData.isActive = isActive;
    const existingProduct = await Product.findOne({
      _id: { $ne: productId },
      name,
      brand,
      subCategoryId,
      type,
      weightInKg,
      isDeleted: false,
    });
    if (existingProduct) {
      throwError(409, "Product with same details already exists");
    }
    if (type || brand || weightInKg || subCategoryId) {
      const SKU = generateSKU(
        type || product.type,
        brand || product.brand,
        subCategory?.name,
        weightInKg || product.weightInKg,
      );
      updatedData.SKU = SKU;
    }
  }
  if (image) {
    if (product.image) await deleteImage(product.image);
    updatedData.image = await uploadImage(image.tempFilePath);
  }
  return await Product.findByIdAndUpdate(productId, updatedData, {
    returnDocument: "after",
  });
};
