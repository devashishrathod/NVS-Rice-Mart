const Product = require("../../models/Product");
const SubCategory = require("../../models/SubCategory");
const { generateSKU } = require("../../helpers/products");
const { throwError, validateObjectId } = require("../../utils");
const { assertOwnership } = require("../assertOwnership");
const { uploadImage, deleteImage } = require("../uploads");

exports.updateProduct = async (productId, payload, image, actor) => {
  validateObjectId(productId, "Product Id");
  const product = await Product.findById(productId);
  if (!product || product.isDeleted) throwError(404, "Product not found!");
  assertOwnership(product, actor, "product");

  const updatedData = {};
  let subCategory = await SubCategory.findOne({
    _id: product.subCategoryId,
    isDeleted: false,
  });

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

    if (subCategoryId) {
      validateObjectId(subCategoryId, "subcategory Id");
      // Pehle yahan `updatedSubCategory = ...` bina declare kiye tha
      // (implicit global).
      const nextSubCategory = await SubCategory.findOne({
        _id: subCategoryId,
        isDeleted: false,
      });
      if (!nextSubCategory) throwError(404, "Sub Category not found");
      // 🔒 Apne hi vendor ki subcategory me move kar sakta hai
      assertOwnership(nextSubCategory, actor, "sub-category");
      subCategory = nextSubCategory;
      updatedData.subCategoryId = subCategoryId;
      updatedData.categoryId = nextSubCategory.categoryId;
    }
    if (name) updatedData.name = name.toLowerCase();
    if (brand) updatedData.brand = brand.toLowerCase();
    if (type) updatedData.type = type.toLowerCase();
    if (description) updatedData.description = description.toLowerCase();
    if (generalPrice !== undefined) updatedData.generalPrice = generalPrice;
    if (stockQuantity !== undefined) updatedData.stockQuantity = stockQuantity;
    if (weightInKg !== undefined) updatedData.weightInKg = weightInKg;
    if (isOutOfStock !== undefined) updatedData.isOutOfStock = isOutOfStock;
    if (isActive !== undefined) updatedData.isActive = isActive;

    // Duplicate check ab MERGED values pe (payload + existing) aur vendor ke
    // andar. Pehle sirf payload ke values use hote the — jo undefined hote
    // the wo query se drop ho jate the, isliye sirf `name` bhejne par bhi
    // jhootha 409 aa jata tha.
    const merged = {
      name: updatedData.name ?? product.name,
      brand: updatedData.brand ?? product.brand,
      subCategoryId: updatedData.subCategoryId ?? product.subCategoryId,
      type: updatedData.type ?? product.type,
      weightInKg: updatedData.weightInKg ?? product.weightInKg,
    };
    const existingProduct = await Product.findOne({
      _id: { $ne: productId },
      userId: product.userId,
      ...merged,
      isDeleted: false,
    });
    if (existingProduct) {
      throwError(409, "You already have a product with these details");
    }

    if (type || brand || weightInKg !== undefined || subCategoryId) {
      updatedData.SKU = generateSKU(
        merged.type,
        merged.brand,
        subCategory?.name,
        merged.weightInKg,
      );
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
