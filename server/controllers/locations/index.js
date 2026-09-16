const { create } = require("./create");
const { upsert } = require("./upsert");
const { getAll } = require("./getAll");
const { get } = require("./get");
const { update, setDefault } = require("./update");
const { deleteLocation } = require("./deleteLocation");

module.exports = {
  create,
  upsert,
  getAll,
  get,
  update,
  setDefault,
  deleteLocation,
};
