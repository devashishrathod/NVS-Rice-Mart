const Category = require("../../models/Category");
const SubCategory = require("../../models/SubCategory");
const {
  throwError,
  toTitleCase,
  toSentenceCase,
  ciExact,
} = require("../../utils");
const { assertOwnership } = require("../assertOwnership");
const { uploadImage } = require("../uploads");

exports.createSubCategory = async (actor, categoryId, payload, image) => {
  const category = await Category.findById(categoryId);
  if (!category || category.isDeleted) throwError(404, "Category not found!");
  // 🔒 Vendor A, Vendor B ki category me subcategory na bana sake.
  assertOwnership(category, actor, "category");

  let { name, description, isActive } = payload;
  name = toTitleCase(name);
  description = toSentenceCase(description);

  const existingSubCategory = await SubCategory.findOne({
    name: ciExact(name), // casing ab save hoti hai — duplicate CI check
    categoryId,
    isDeleted: false,
  });
  if (existingSubCategory) {
    throwError(
      409,
      `SubCategory already exist with this name for ${category.name} category`,
    );
  }

  let imageUrl;
  if (image) imageUrl = await uploadImage(image.tempFilePath);
  return await SubCategory.create({
    // Owner hamesha category ka owner — actor sirf usi ka ho sakta hai
    // (admin ke case me category ka owner hi sahi answer hai).
    userId: category.userId,
    name,
    description,
    categoryId,
    image: imageUrl,
    isActive,
  });
};
