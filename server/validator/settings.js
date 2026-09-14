const Joi = require("joi");

/**
 * Platform settings — ab sirf HARD LIMITS.
 * Delivery ka pricing per-vendor hai (`PUT /vendors/me/delivery`).
 */
exports.validateUpsertSetting = (data) => {
  const deliverySchema = Joi.object({
    maxRadiusKm: Joi.number().min(0).messages({
      "number.base": "Max radius km must be a number",
      "number.min": "Max radius km cannot be negative",
    }),
    maxAllowedDeliveryCharge: Joi.number().min(0).messages({
      "number.base": "Max allowed delivery charge must be a number",
      "number.min": "Max allowed delivery charge cannot be negative",
    }),
  });
  const schema = Joi.object({
    delivery: deliverySchema,
  });
  return schema.validate(data, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });
};
