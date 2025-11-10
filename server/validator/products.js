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

exports.validateGetAllProductsQuery = (payload) => {
  const getAllQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).optional(),
    search: Joi.string().optional(),
    name: Joi.string().optional(),
    brand: Joi.string().optional(),
    categoryId: objectId().optional(),
    subCategoryId: objectId().optional(),
    SKU: Joi.string().optional(),
    type: Joi.string().valid("grocery", "electronics", "clothing").optional(),
    price: Joi.number().optional(),
    minPrice: Joi.number().optional(),
    maxPrice: Joi.number().optional(),
    weightInKg: Joi.number().optional(),
    minWeight: Joi.number().optional(),
    maxWeight: Joi.number().optional(),
    stockQuantity: Joi.number().optional(),
    minStock: Joi.number().optional(),
    maxStock: Joi.number().optional(),
    isActive: Joi.alternatives().try(Joi.boolean(), Joi.string()).optional(),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().optional(),
    sortBy: Joi.string()
      .valid("generalPrice", "createdAt", "stockQuantity", "weightInKg")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
  });
  return getAllQuerySchema.validate(payload, { abortEarly: false });
};
