const Product = require("../../models/Product");
const SubCategory = require("../../models/SubCategory");
const { generateSKU } = require("../../helpers/products");
const { throwError, validateObjectId } = require("../../utils");
const { assertOwnership } = require("../assertOwnership");
const { uploadImage } = require("../uploads");
const { PRODUCT_TYPES } = require("../../constants");

exports.createProduct = async (actor, payload, image) => {
  let {
    name,
    brand,
    description,
    type,
    generalPrice,
    stockQuantity,
    subCategoryId,
    weightInKg,
    isActive,
  } = payload;

  validateObjectId(subCategoryId, "subcategory Id");
  const subCategory = await SubCategory.findOne({
    _id: subCategoryId,
    isDeleted: false,
  });
  if (!subCategory) throwError(404, "Sub Category not found");
  // 🔒 Pehle product ka owner `subCategory.userId` ban jata tha — matlab
  // Vendor A doosre vendor ki subcategory me product banata to wo product
  // usi doosre vendor ka ho jata.
  assertOwnership(subCategory, actor, "sub-category");

  name = name?.toLowerCase();
  brand = brand?.toLowerCase();
  type = type?.toLowerCase() || PRODUCT_TYPES.GROCERY;
  description = description?.toLowerCase();

  // Duplicate check ab vendor ke andar — pehle global tha, isliye doosra
  // vendor wahi product list hi nahi kar sakta tha.
  const existingProduct = await Product.findOne({
    userId: subCategory.userId,
    name,
    brand,
    subCategoryId,
    type,
    weightInKg,
    isDeleted: false,
  });
  if (existingProduct) {
    throwError(409, "You already have a product with these details");
  }

  const SKU = generateSKU(type, brand, subCategory?.name, weightInKg);
  let imageUrl;
  if (image) imageUrl = await uploadImage(image.tempFilePath);

  return await Product.create({
    userId: subCategory.userId,
    categoryId: subCategory.categoryId,
    subCategoryId,
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
