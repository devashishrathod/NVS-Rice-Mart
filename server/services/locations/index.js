const { createLocation } = require("./createLocation");
const { upsertLocation } = require("./upsertLocation");
const { getAllLocations } = require("./getAllLocations");
const { getLocation } = require("./getLocation");
const { updateLocation, setDefaultLocation } = require("./updateLocation");
const { deleteLocation } = require("./deleteLocation");

module.exports = {
  createLocation,
  upsertLocation,
  getAllLocations,
  getLocation,
  updateLocation,
  setDefaultLocation,
  deleteLocation,
};
