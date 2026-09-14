const Category = require("../../models/Category");
const { throwError } = require("../../utils");
const { uploadImage } = require("../uploads");

exports.createCategory = async (userId, payload, image) => {
  let { name, description, isActive } = payload;
  name = name?.toLowerCase();
  description = description?.toLowerCase();

  // Uniqueness ab VENDOR ke andar hai. Pehle globally unique tha — matlab
  // doosra vendor "rice" naam ki category bana hi nahi sakta tha.
  const existingCategory = await Category.findOne({
    userId,
    name,
    isDeleted: false,
  });
  if (existingCategory) {
    throwError(409, "You already have a category with this name");
  }

  let imageUrl;
  if (image) imageUrl = await uploadImage(image.tempFilePath);
  return await Category.create({
    userId,
    name,
    description,
    image: imageUrl,
    isActive,
  });
};
