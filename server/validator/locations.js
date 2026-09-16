const Joi = require("joi");
const objectId = require("./validJoiObjectId");

/**
 * Zipcode string ya number dono chal jate hain (purane clients number
 * bhejte hain) — aage sab jagah string hi jata hai.
 *
 * Yahan India-specific pattern jaan-boojh ke NAHI lagaya: country ke
 * hisaab se validation service me `isValidZipCode()` karta hai (DB me
 * ek US address bhi pada hai).
 */
const zipcodeField = Joi.alternatives()
  .try(Joi.string().trim().max(20), Joi.number())
  .custom((v) => String(v).trim())
  .messages({
    "alternatives.match": "Zip Code / Postal Code must be a string or number",
  });

const coordinatesField = Joi.array().items(Joi.number()).length(2).messages({
  // ⚠️ Purana message "[longitude, latitude]" bolta tha — wo GALAT tha.
  // Code har jagah `[lat, lng]` padhta hai (placeOrder.js:83).
  "array.length": "Coordinates must be [latitude, longitude]",
  "array.base": "Coordinates must be an array [latitude, longitude]",
});

/**
 * Address ke wo fields jo create aur upsert dono maangte hain.
 * Inke bina delivery serviceability resolve hi nahi hoti.
 */
const requiredAddressFields = {
  address: Joi.string().trim().min(1).required().messages({
    "any.required": "Address is required",
    "string.empty": "Address cannot be empty",
  }),
  city: Joi.string().trim().min(1).required().messages({
    "any.required": "City is required",
    "string.empty": "City cannot be empty",
  }),
  state: Joi.string().trim().min(1).required().messages({
    "any.required": "State is required",
    "string.empty": "State cannot be empty",
  }),
  zipcode: zipcodeField.required().messages({
    "any.required": "Zip Code / Postal Code is required",
  }),
  coordinates: coordinatesField.required().messages({
    "any.required": "Coordinates [latitude, longitude] are required",
  }),
};

/**
 * Optional fields. `district` yahan hai — pehle required tha.
 * `""` bhejna allowed hai (matlab "is field ko khali kar do").
 */
const optionalAddressFields = {
  district: Joi.string().trim().allow("").optional(),
  name: Joi.string().trim().max(100).allow("").optional(),
  shopOrBuildingNumber: Joi.string().trim().max(100).allow("").optional(),
  area: Joi.string().trim().max(150).allow("").optional(),
  country: Joi.string().trim().min(2).max(80).optional(),
  formattedAddress: Joi.string().trim().max(500).allow("").optional(),
};

const userIdField = objectId().optional().messages({
  "any.invalid": "Invalid userId format",
});

// `stripUnknown: true` isliye ki purane clients jo extra fields bhejte hain
// (`isProductAddress`, `type`, `geo` …) unhe 422 na mile — chup-chaap drop.
const OPTS = { abortEarly: false, stripUnknown: true, convert: true };

/**
 * 🆕 Ab ye actually use hoti hai. Pehle ye likhi hui thi par `create`
 * controller isse call hi nahi karta tha — create route pe ZERO validation
 * thi aur poora payload seedha service me chala jata tha.
 */
exports.validateCreateLocation = (data) => {
  const schema = Joi.object({
    userId: userIdField,
    ...requiredAddressFields,
    ...optionalAddressFields,
    isDefault: Joi.boolean().optional(),
  });
  return schema.validate(data, OPTS);
};

/**
 * 🆕 `PUT /locations/upsert` — "mera address save kar do".
 *
 * Shape create jaisi hi hai, do farq ke saath:
 *   - `isDefault` accept nahi hota — upsert HAMESHA default address pe kaam
 *     karta hai, isliye wo flag ka koi matlab nahi.
 *   - Poora address chahiye (partial patch nahi). Sirf ek field badalne ke
 *     liye `PUT /locations/update/:id` hai.
 */
exports.validateUpsertLocation = (data) => {
  const schema = Joi.object({
    userId: userIdField,
    ...requiredAddressFields,
    ...optionalAddressFields,
  });
  return schema.validate(data, OPTS);
};

exports.validateUpdateLocation = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    shopOrBuildingNumber: Joi.string().allow("").optional(),
    address: Joi.string().optional(),
    area: Joi.string().allow("").optional(),
    city: Joi.string().optional(),
    district: Joi.string().optional(),
    state: Joi.string().optional(),
    country: Joi.string().min(2).max(80).optional(),
    zipcode: Joi.string().optional(),
    formattedAddress: Joi.string().allow("").optional(),
    coordinates: Joi.array().items(Joi.number()).length(2).optional().messages({
      "array.length": "Coordinates must be [latitude, longitude]",
    }),
    isDefault: Joi.boolean().optional(),
  })
    .min(1)
    .messages({ "object.min": "At least one field is required to update" });
  return schema.validate(data, { abortEarly: false, stripUnknown: true });
};

exports.validateGetAllLocationsQuery = (payload) => {
  const getAllQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).optional(),
    search: Joi.string().optional(),
    name: Joi.string().optional(),
    shopOrBuildingNumber: Joi.string().optional(),
    userId: objectId().optional().messages({
      "any.invalid": "Invalid userId format",
    }),
    address: Joi.string().optional(),
    area: Joi.string().optional(),
    city: Joi.string().optional(),
    district: Joi.string().optional(),
    state: Joi.string().optional(),
    zipcode: Joi.string().optional(),
    country: Joi.string().optional(),
    isProductAddress: Joi.alternatives()
      .try(Joi.string(), Joi.boolean())
      .optional(),
    isDefault: Joi.alternatives().try(Joi.string(), Joi.boolean()).optional(),
    isActive: Joi.alternatives().try(Joi.string(), Joi.boolean()).optional(),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().optional(),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
  });
  return getAllQuerySchema.validate(payload, { abortEarly: false });
};
