const Joi = require("joi");
const objectId = require("./validJoiObjectId");

exports.validateAddOrUpdateCart = (data) => {
  const createSchema = Joi.object({
    productId: objectId().required().messages({
      "any.required": "ProductId is required",
      "any.invalid": "Invalid productId format",
    }),
    quantity: Joi.number().integer().min(0).max(100).required().messages({
      "number.min": "Product quantity cannot be negative",
      "number.max": "Product quantity cannot exceed {#limit} items",
    }),
  });
  return createSchema.validate(data, { abortEarly: false });
};

exports.validateRemoveFromCart = (data) => {
  const createSchema = Joi.object({
    action: Joi.string().valid("remove", "decrease").required().messages({
      "any.required": "Action is required",
    }),
  });
  return createSchema.validate(data, { abortEarly: false });
};
