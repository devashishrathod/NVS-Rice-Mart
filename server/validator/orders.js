const Joi = require("joi");
const objectId = require("./validJoiObjectId");
const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHODS,
} = require("../constants");

exports.validateCreateOrder = (data) => {
  const schema = Joi.object({
    locationId: objectId().required().messages({
      "any.required": "Location ID is required",
      "any.invalid": "Invalid location ID format",
      "string.empty": "Location ID cannot be empty",
    }),
    // Online payment abhi disabled hai — sirf COD accept hota hai.
    paymentMethod: Joi.string()
      .required()
      .valid(PAYMENT_METHODS.COD)
      .messages({
        "any.required": "Payment method is required",
        "string.base": "Payment method must be a string",
        "any.only": "Only Cash on Delivery (COD) is available right now",
        "string.empty": "Payment method cannot be empty",
      }),
  });
  return schema.validate(data, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });
};

exports.validateUpdateOrderStatus = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid(...Object.values(ORDER_STATUS))
      .required()
      .messages({ "any.required": "status is required" }),
    note: Joi.string().max(300).allow("").optional(),
    reason: Joi.string().max(300).allow("").optional(),
  });
  return schema.validate(data, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });
};

exports.validateCancelOrder = (data) => {
  const schema = Joi.object({
    reason: Joi.string().max(300).allow("").optional(),
  });
  return schema.validate(data, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });
};

exports.validateOrderPreview = (data) => {
  const schema = Joi.object({
    locationId: objectId().required().messages({
      "any.required": "Location ID is required",
      "any.invalid": "Invalid location ID format",
    }),
  });
  return schema.validate(data, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });
};

exports.validateGetAllOrdersQuery = (payload) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).optional(),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().optional(),
    orderId: objectId().optional(),
    userId: objectId().optional(),
    vendorId: objectId().optional(),
    orderNumber: Joi.string().optional(),
    cartId: objectId().optional(),
    locationId: objectId().optional(),
    paymentMethod: Joi.string()
      .valid(...Object.values(PAYMENT_METHODS))
      .optional(),
    status: Joi.string()
      .valid(...Object.values(ORDER_STATUS))
      .optional(),
    paymentStatus: Joi.string()
      .valid(...Object.values(PAYMENT_STATUS))
      .optional(),
    razorpayOrderId: Joi.string().optional(),
    deliveryPincode: Joi.string().optional(),
    minPayableAmount: Joi.number().min(0).optional(),
    maxPayableAmount: Joi.number().min(0).optional(),
    minSubTotal: Joi.number().min(0).optional(),
    maxSubTotal: Joi.number().min(0).optional(),
    minDeliveryCharge: Joi.number().min(0).optional(),
    maxDeliveryCharge: Joi.number().min(0).optional(),
    minDistanceKm: Joi.number().min(0).optional(),
    maxDistanceKm: Joi.number().min(0).optional(),
    search: Joi.string().optional(),
  });
  return schema.validate(payload, { abortEarly: false });
};

exports.validateUpdateOrder = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid(...Object.values(ORDER_STATUS))
      .optional(),
    paymentStatus: Joi.string()
      .valid(...Object.values(PAYMENT_STATUS))
      .optional(),
  })
    .min(1)
    .messages({
      "object.min": "At least one field is required to update",
    });

  return schema.validate(data, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });
};

exports.validateVerifyOrderPayment = (data) => {
  const schema = Joi.object({
    razorpay_order_id: Joi.string().trim().required().messages({
      "any.required": "Razorpay order id is required",
      "string.base": "Razorpay order id must be a string",
      "string.empty": "Razorpay order id cannot be empty",
    }),
    razorpay_payment_id: Joi.string().trim().required().messages({
      "any.required": "Razorpay payment id is required",
      "string.base": "Razorpay payment id must be a string",
      "string.empty": "Razorpay payment id cannot be empty",
    }),
    razorpay_signature: Joi.string().trim().required().messages({
      "any.required": "Razorpay signature is required",
      "string.base": "Razorpay signature must be a string",
      "string.empty": "Razorpay signature cannot be empty",
    }),
  });
  return schema.validate(data, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });
};
