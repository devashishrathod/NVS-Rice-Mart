const Category = require("../../models/Category");
const { ERROR_CODES } = require("../../constants");
const { throwError, validateObjectId } = require("../../utils");

exports.getCategoryById = async (id, serviceContext) => {
  validateObjectId(id, "Category Id");
  const category = await Category.findById(id);
  if (!category || category.isDeleted) throwError(404, "Category not found");
  if (serviceContext?.activeOnly && !category.isActive) {
    throwError(404, "Category not found");
  }
  if (serviceContext?.vendorIds) {
    const allowed = serviceContext.vendorIds.map(String);
    if (!allowed.includes(String(category.userId))) {
      throwError(
        404,
        "This category is not available in your area",
        ERROR_CODES.PRODUCT_NOT_AVAILABLE_HERE,
      );
    }
  }
  return category;
};
