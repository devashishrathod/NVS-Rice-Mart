const Joi = require("joi");
const objectId = require("./validJoiObjectId");

const areaSchema = Joi.object({
  zipcode: Joi.string().trim().required(),
  city: Joi.string().allow("").optional(),
  district: Joi.string().allow("").optional(),
  state: Joi.string().allow("").optional(),
  country: Joi.string().min(2).max(80).optional(),
  etaMinutes: Joi.number().integer().min(0).optional(),
  minOrderAmount: Joi.number().min(0).optional(),
  freeDeliveryAbove: Joi.number().min(0).optional(),
  deliveryChargeOverride: Joi.number().min(0).optional(),
});

exports.validateAddServiceAreas = (data) => {
  const schema = Joi.object({
    locationId: objectId().required().messages({
      "any.required": "locationId (branch) is required",
      "any.invalid": "Invalid locationId format",
    }),
    areas: Joi.alternatives()
      .try(Joi.array().items(areaSchema).min(1), areaSchema)
      .required()
      .messages({ "any.required": "areas is required" }),
  });
  return schema.validate(data, { abortEarly: false, stripUnknown: true });
};

exports.validateReassignServiceArea = (data) => {
  const schema = Joi.object({
    zipcode: Joi.string().trim().required(),
    toVendorId: objectId().required(),
    toLocationId: objectId().required(),
  });
  return schema.validate(data, { abortEarly: false, stripUnknown: true });
};

exports.validateGetServiceAreasQuery = (data) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(500).optional(),
    zipcode: Joi.string().optional(),
    isActive: Joi.alternatives().try(Joi.string(), Joi.boolean()).optional(),
  });
  return schema.validate(data, { abortEarly: false });
};

exports.validateZipcodeQuery = (data) => {
  const schema = Joi.object({ zipcode: Joi.string().trim().required() });
  return schema.validate(data, { abortEarly: false });
};
