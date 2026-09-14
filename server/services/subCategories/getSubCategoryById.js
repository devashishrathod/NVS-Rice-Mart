const SubCategory = require("../../models/SubCategory");
const { ERROR_CODES } = require("../../constants");
const { throwError, validateObjectId } = require("../../utils");

exports.getSubCategoryById = async (id, serviceContext) => {
  validateObjectId(id, "SubCategory Id");
  const subcategory = await SubCategory.findById(id);
  if (!subcategory || subcategory.isDeleted) {
    throwError(404, "SubCategory not found");
  }
  if (serviceContext?.activeOnly && !subcategory.isActive) {
    throwError(404, "SubCategory not found");
  }
  if (serviceContext?.vendorIds) {
    const allowed = serviceContext.vendorIds.map(String);
    if (!allowed.includes(String(subcategory.userId))) {
      throwError(
        404,
        "This sub-category is not available in your area",
        ERROR_CODES.PRODUCT_NOT_AVAILABLE_HERE,
      );
    }
  }
  return subcategory;
};
