const { create } = require("./create");
const { getAll } = require("./getAll");
const { getOne } = require("./getOne");
// const { update } = require("./update");
const { deleteProduct } = require("./deleteProduct");
const { addProductLocations } = require("./addProductLocations");
const { removeProductLocations } = require("./removeProductLocations");

module.exports = {
  create,
  getAll,
  getOne,
  // update,
  deleteProduct,
  removeProductLocations,
  addProductLocations,
};
