const Category = require("../../models/Category");
const {
  throwError,
  validateObjectId,
  toTitleCase,
  toSentenceCase,
  ciExact,
} = require("../../utils");
const { assertOwnership } = require("../assertOwnership");
const { uploadImage, deleteImage } = require("../uploads");

exports.updateCategoryById = async (id, payload, image, actor) => {
  validateObjectId(id, "Category Id");
  const category = await Category.findById(id);
  if (!category || category.isDeleted) throwError(404, "Category not found");
  assertOwnership(category, actor, "category");

  if (payload) {
    let { name, description, isActive } = payload;
    if (typeof isActive !== "undefined") {
      // Pehle ye `!category.isActive` (toggle) karta tha — client jo bhejta
      // tha usse ulta ho jata tha. Ab bheji hui value hi set hoti hai.
      category.isActive = isActive === true || isActive === "true";
    }
    if (name) {
      name = toTitleCase(name);
      const existing = await Category.findOne({
        _id: { $ne: id },
        userId: category.userId, // vendor ke andar hi unique
        name: ciExact(name), // "Rice" aur "rice" ek hi maane jayein
        isDeleted: false,
      });
      if (existing) {
        throwError(409, "You already have another category with this name");
      }
      category.name = name;
    }
    if (description) category.description = toSentenceCase(description);
  }
  if (image) {
    if (category.image) await deleteImage(category.image);
    category.image = await uploadImage(image.tempFilePath);
  }
  await category.save();
  return category;
};
