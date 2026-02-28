const Joi = require("joi");
const objectId = require("./validJoiObjectId");

exports.validateUpsertSetting = (data) => {
  const deliverySchema = Joi.object({
    shopLocationId: objectId().allow(null).messages({
      "any.invalid": "Invalid shop location id format",
    }),
    baseCharge: Joi.number().min(0).messages({
      "number.base": "Base charge must be a number",
      "number.min": "Base charge cannot be negative",
    }),
    perKmRate: Joi.number().min(0).messages({
      "number.base": "Per km rate must be a number",
      "number.min": "Per km rate cannot be negative",
    }),
    perKgRate: Joi.number().min(0).messages({
      "number.base": "Per kg rate must be a number",
      "number.min": "Per kg rate cannot be negative",
    }),
    distanceFactor: Joi.number().min(0).messages({
      "number.base": "Distance factor must be a number",
      "number.min": "Distance factor cannot be negative",
    }),
    weightFactor: Joi.number().min(0).messages({
      "number.base": "Weight factor must be a number",
      "number.min": "Weight factor cannot be negative",
    }),
    minDeliveryCharge: Joi.number().min(0).messages({
      "number.base": "Min delivery charge must be a number",
      "number.min": "Min delivery charge cannot be negative",
    }),
    baseMaxCharge: Joi.number().min(0).messages({
      "number.base": "Base max charge must be a number",
      "number.min": "Base max charge cannot be negative",
    }),
    maxPerKgIncrement: Joi.number().min(0).messages({
      "number.base": "Max per kg increment must be a number",
      "number.min": "Max per kg increment cannot be negative",
    }),
    maxPerKmIncrement: Joi.number().min(0).messages({
      "number.base": "Max per km increment must be a number",
      "number.min": "Max per km increment cannot be negative",
    }),
    maxRadiusKm: Joi.number().min(0).messages({
      "number.base": "Max radius km must be a number",
      "number.min": "Max radius km cannot be negative",
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
