const Joi = require("joi");
const objectId = require("./validJoiObjectId");

exports.validateAddProductLocations = (data) => {
  const schema = Joi.object({
    locations: Joi.array()
      .items(
        Joi.object({
          locationId: objectId().required().messages({
            "any.required": "locationId is required",
            "string.empty": "locationId cannot be empty",
          }),
          price: Joi.number().min(0).optional().messages({
            "number.base": "price must be a number",
            "number.min": "price cannot be negative",
          }),
          stockQuantity: Joi.number().min(0).optional().messages({
            "number.base": "stockQuantity must be a number",
            "number.min": "stockQuantity cannot be negative",
          }),
        })
      )
      .min(1)
      .required()
      .messages({
        "any.required": "locations array is required",
        "array.base": "locations must be an array",
        "array.min": "At least one location is required",
      }),
  });
  return schema.validate(data, { abortEarly: false });
};

exports.validateRemoveProductLocations = (data) => {
  const schema = Joi.object({
    locationIds: Joi.array()
      .items(
        objectId().required().messages({
          "any.required": "locationId is required",
          "string.empty": "locationId cannot be empty",
        })
      )
      .min(1)
      .required()
      .messages({
        "any.required": "locationIds is required",
        "array.base": "locationIds must be an array",
        "array.min": "At least one locationId is required",
      }),
  });
  return schema.validate(data, { abortEarly: false });
};
