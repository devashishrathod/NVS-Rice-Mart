const SubCategory = require("../../models/SubCategory");
const { throwError, validateObjectId } = require("../../utils");
const { assertOwnership } = require("../assertOwnership");
const { deleteImage } = require("../uploads");

exports.deleteSubCategoryById = async (id, actor) => {
  validateObjectId(id, "SubCategory Id");
  const subCategory = await SubCategory.findById(id);
  if (!subCategory || subCategory.isDeleted) {
    throwError(404, "subCategory not found");
  }
  assertOwnership(subCategory, actor, "sub-category");

  await deleteImage(subCategory?.image);
  subCategory.image = null;
  subCategory.isDeleted = true;
  subCategory.isActive = false;
  await subCategory.save();
  return;
};
