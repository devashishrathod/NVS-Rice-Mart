const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;
const isValidId = ObjectId.isValid;

const refField = (refModel, errorLabel = refModel) =>
  Object.freeze({
    type: ObjectId,
    ref: refModel,
    validate: {
      validator: (value) => {
        if (value === null || value === undefined) return true;
        return isValidId(value);
      },
      message: (props) => `${props.value} is not a valid ${errorLabel} ID`,
    },
  });

module.exports = Object.freeze({
  userField: refField("User"),
  categoryField: refField("Category"),
  subCategoryField: refField("SubCategory"),
  locationField: refField("Location"),
  ProductField: refField("Product"),

  // Array of ObjectIds with validation
  locationsField: Object.freeze({
    type: [ObjectId],
    ref: "location",
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.every(isValidId),
      message: (props) =>
        `One or more location IDs in ${props.value} are invalid`,
    },
  }),

  productsField: Object.freeze({
    type: [ObjectId],
    ref: "Product",
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.every(isValidId),
      message: (props) =>
        `One or more Product IDs in ${props.value} are invalid`,
    },
  }),
});
