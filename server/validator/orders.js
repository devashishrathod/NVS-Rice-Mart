const Joi = require("joi");

exports.validateCreateOrder = (data) => {
  const schema = Joi.object({
    paymentMethod: Joi.string().required().valid("COD", "ONLINE").messages({
      "any.required": "Payment method is required",
      "string.base": "Payment method must be a string",
      "any.only": "Payment method must be either COD or ONLINE",
      "string.empty": "Payment method cannot be empty",
    }),
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
