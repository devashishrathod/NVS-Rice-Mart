const Joi = require("joi");
const objectId = require("./validJoiObjectId");
const { VENDOR_STATUS } = require("../constants");

const coordinates = Joi.array()
  .items(Joi.number().required())
  .length(2)
  .messages({
    "array.length": "Coordinates must be [latitude, longitude]",
  });

const branchSchema = Joi.object({
  name: Joi.string().max(100).allow("").optional(),
  shopOrBuildingNumber: Joi.string().max(100).allow("").optional(),
  address: Joi.string().required(),
  area: Joi.string().allow("").optional(),
  city: Joi.string().required(),
  district: Joi.string().required(),
  state: Joi.string().required(),
  country: Joi.string().min(2).max(80).optional(),
  zipcode: Joi.string().required(),
  formattedAddress: Joi.string().allow("").optional(),
  coordinates: coordinates.required(),
  isDefault: Joi.boolean().default(false).optional(),
});

// Vendor khud ye manage karta hai. Cap fields `null` allow karte hain =
// "koi cap nahi" (0 ka matlab "cap 0" hota, jo charge ko hamesha 0 kar deta).
const deliverySchema = Joi.object({
  isEnabled: Joi.boolean().optional(),
  baseCharge: Joi.number().min(0).optional(),
  perKmRate: Joi.number().min(0).optional(),
  perKgRate: Joi.number().min(0).optional(),
  minDeliveryCharge: Joi.number().min(0).optional(),
  baseMaxCharge: Joi.number().min(0).allow(null).optional(),
  maxPerKgIncrement: Joi.number().min(0).allow(null).optional(),
  maxPerKmIncrement: Joi.number().min(0).allow(null).optional(),
  freeDeliveryAbove: Joi.number().min(0).allow(null).optional(),
  minOrderAmount: Joi.number().min(0).optional(),
  maxRadiusKm: Joi.number().min(0).allow(null).optional(),
});

/** Vendor ka self-service endpoint — sirf delivery config. */
exports.validateUpdateVendorDelivery = (data) => {
  const schema = deliverySchema
    .min(1)
    .messages({ "object.min": "At least one delivery setting is required" });
  return schema.validate(data, { abortEarly: false, stripUnknown: true });
};

const payoutSchema = Joi.object({
  accountHolder: Joi.string().allow("").optional(),
  accountNumber: Joi.string().allow("").optional(),
  ifsc: Joi.string().allow("").optional(),
  upiId: Joi.string().allow("").optional(),
});

exports.validateCreateVendor = (data) => {
  const schema = Joi.object({
    shopName: Joi.string().min(2).max(120).required(),
    name: Joi.string().min(2).max(120).optional(),
    email: Joi.string().email().optional(),
    mobile: Joi.string().optional(),
    password: Joi.string().min(6).max(64).required(),
    legalName: Joi.string().allow("").max(150).optional(),
    gstNumber: Joi.string().allow("").max(20).optional(),
    fssaiNumber: Joi.string().allow("").max(20).optional(),
    supportMobile: Joi.string().allow("").optional(),
    logo: Joi.string().allow("").optional(),
    commissionPercent: Joi.number().min(0).max(100).optional(),
    delivery: deliverySchema.optional(),
    payout: payoutSchema.optional(),
    branch: branchSchema.required(),
  })
    .or("email", "mobile")
    .messages({ "object.missing": "Email or mobile is required" });
  return schema.validate(data, { abortEarly: false, stripUnknown: true });
};

exports.validateUpdateVendor = (data) => {
  const schema = Joi.object({
    shopName: Joi.string().min(2).max(120).optional(),
    name: Joi.string().min(2).max(120).optional(),
    mobile: Joi.string().optional(),
    legalName: Joi.string().allow("").max(150).optional(),
    gstNumber: Joi.string().allow("").max(20).optional(),
    fssaiNumber: Joi.string().allow("").max(20).optional(),
    supportMobile: Joi.string().allow("").optional(),
    logo: Joi.string().allow("").optional(),
    commissionPercent: Joi.number().min(0).max(100).optional(),
    status: Joi.string()
      .valid(...Object.values(VENDOR_STATUS))
      .optional(),
    delivery: deliverySchema.optional(),
    payout: payoutSchema.optional(),
  })
    .min(1)
    .messages({ "object.min": "At least one field is required to update" });
  return schema.validate(data, { abortEarly: false, stripUnknown: true });
};

exports.validateUpdateVendorStatus = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid(...Object.values(VENDOR_STATUS))
      .required(),
  });
  return schema.validate(data, { abortEarly: false, stripUnknown: true });
};

exports.validateCreateBranch = (data) =>
  branchSchema.validate(data, { abortEarly: false, stripUnknown: true });

exports.validateGetAllVendorsQuery = (data) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    search: Joi.string().optional(),
    shopName: Joi.string().optional(),
    zipcode: Joi.string().optional(),
    status: Joi.string()
      .valid(...Object.values(VENDOR_STATUS))
      .optional(),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
  });
  return schema.validate(data, { abortEarly: false });
};

exports.objectIdParam = objectId;
