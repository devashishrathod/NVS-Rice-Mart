const Product = require("../../models/Product");
const SubCategory = require("../../models/SubCategory");
const { generateSKU } = require("../../helpers/products");
const { throwError, validateObjectId } = require("../../utils");
const { uploadImage } = require("../uploads");
const { PRODUCT_TYPES } = require("../../constants");

exports.createProduct = async (payload, image) => {
  let {
    name,
    brand,
    description,
    type,
    generalPrice,
    stockQuantity,
    subCategoryId,
    locationIds,
    weightInKg,
    isActive,
  } = payload;
  validateObjectId(subCategoryId, "subcategory Id");
  const subCategory = await SubCategory.findOne({
    _id: subCategoryId,
    isDeleted: false,
  });
  if (!subCategory) throwError(404, "Sub Category not found");
  name = name?.toLowerCase();
  brand = brand?.toLowerCase();
  type = type?.toLowerCase() || PRODUCT_TYPES.GROCERY;
  description = description?.toLowerCase();
  const existingProduct = await Product.findOne({
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
  const SKU = generateSKU(type, brand, subCategory?.name, weightInKg);
  let imageUrl;
  if (image) imageUrl = await uploadImage(image.tempFilePath);
  return await Product.create({
    categoryId: subCategory?.categoryId,
    subCategoryId,
    locationIds,
    name,
    brand,
    description,
    generalPrice,
    stockQuantity,
    image: imageUrl,
    weightInKg,
    SKU,
    isActive,
  });
};
