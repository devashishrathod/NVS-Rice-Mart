const { create } = require("./create");
const { getAll } = require("./getAll");
const { getOne } = require("./getOne");
const { update } = require("./update");
const { deleteProduct } = require("./deleteProduct");

// NOTE: `addProductLocations` / `removeProductLocations` / `checkProductDelivery`
// hata diye gaye. Price aur stock ka single source ab `Product` hai (D3),
// aur `productlocations` collection migration me drop ho jati hai.
// Purana code git history me hai.

module.exports = {
  create,
  getAll,
  getOne,
  update,
  deleteProduct,
};
