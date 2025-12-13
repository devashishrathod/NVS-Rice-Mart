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

exports.validateVerifyCart = (data) => {
  const schema = Joi.object({
    zipcode: Joi.alternatives()
      .try(
        Joi.string()
          .trim()
          .pattern(/^[1-9][0-9]{5}$/)
          .length(6)
          .messages({
            "string.pattern.base": "Invalid Indian PIN code",
            "string.empty": "Zip Code / Postal Code cannot be empty",
          }),
        Joi.number().integer().min(100000).max(999999).messages({
          "number.base": "Zip Code / Postal Code must be a number",
          "number.min": "Invalid Indian PIN code",
          "number.max": "Invalid Indian PIN code",
          "number.integer": "Zip Code / Postal Code must be an integer",
        })
      )
      .required()
      .messages({
        "any.required": "Zip Code / Postal Code is required",
      }),
  });
  return schema.validate(data, {
    abortEarly: false,
    convert: true,
  });
};
