const { asyncWrapper, sendSuccess } = require("../../utils");
const { getSubCategoryById } = require("../../services/subCategories");

exports.getSubCategory = asyncWrapper(async (req, res) => {
  const subCategory = await getSubCategoryById(
    req.params?.id,
    req.serviceContext,
  );
  return sendSuccess(res, 200, "Sub-category fetched", subCategory);
});
