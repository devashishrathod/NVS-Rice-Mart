const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { updateProduct } = require("../../services/products");
const { validateUpdateProduct } = require("../../validator/products");

exports.update = asyncWrapper(async (req, res) => {
  const { error, value } = validateUpdateProduct(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const image = req.files?.image;
  const product = await updateProduct(req.params.id, value, image);
  return sendSuccess(res, 200, "Product updated successfully", product);
});
