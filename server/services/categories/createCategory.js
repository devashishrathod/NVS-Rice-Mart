const Category = require("../../models/Category");
const { throwError, toTitleCase, toSentenceCase, ciExact } = require("../../utils");
const { uploadImage } = require("../uploads");

exports.createCategory = async (userId, payload, image) => {
  let { name, description, isActive } = payload;
  // Display fields ab lowercase nahi hote — "Basmati Rice" waise hi save.
  name = toTitleCase(name);
  description = toSentenceCase(description);

  // Uniqueness ab VENDOR ke andar hai. Pehle globally unique tha — matlab
  // doosra vendor "rice" naam ki category bana hi nahi sakta tha.
  // `ciExact` isliye ki ab casing save hoti hai — warna "Rice" aur "rice"
  // dono ban jate.
  const existingCategory = await Category.findOne({
    userId,
    name: ciExact(name),
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
