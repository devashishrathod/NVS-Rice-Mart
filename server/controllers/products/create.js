const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { createProduct } = require("../../services/products");
const { validateCreateProduct } = require("../../validator/products");

exports.create = asyncWrapper(async (req, res) => {
  const { error } = validateCreateProduct(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const image = req.files?.image;
  const product = await createProduct(req.body, image);
  return sendSuccess(res, 201, "Product created successfully", product);
});
