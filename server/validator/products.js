const Joi = require("joi");
const objectId = require("./validJoiObjectId");

exports.validateCreateProduct = (data) => {
  const createSchema = Joi.object({
    name: Joi.string().min(3).max(100).required().messages({
      "string.min": "Name has minimum {#limit} characters",
      "string.max": "Name cannot exceed {#limit} characters",
    }),
    description: Joi.string().allow("").max(500).messages({
      "string.max": "Description cannot exceed {#limit} characters",
    }),
    subCategoryId: objectId().required().messages({
      "any.invalid": "Invalid subCategoryId format",
    }),
    type: Joi.string().valid("grocery", "electronics", "clothing").optional(),
    locationIds: Joi.array().items(objectId()).optional(),
    brand: Joi.string().min(3).max(80).required().messages({
      "string.min": "Brand has minimum {#limit} characters",
      "string.max": "Brand cannot exceed {#limit} characters",
    }),
    generalPrice: Joi.number().min(0).required().messages({
      "number.min": "General Price cannot be negative",
    }),
    stockQuantity: Joi.number().min(0).required().messages({
      "number.min": "Stock Quantity cannot be negative",
    }),
    weightInKg: Joi.number().min(0).required().messages({
      "number.min": "Weight in Kg cannot be negative",
    }),
    isActive: Joi.boolean().optional(),
  });
  return createSchema.validate(data, { abortEarly: false });
};
