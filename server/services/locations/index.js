const { createLocation } = require("./createLocation");
const { getAllLocations } = require("./getAllLocations");
const { getLocation } = require("./getLocation");
const { updateLocation, setDefaultLocation } = require("./updateLocation");
const { deleteLocation } = require("./deleteLocation");

module.exports = {
  createLocation,
  getAllLocations,
  getLocation,
  updateLocation,
  setDefaultLocation,
  deleteLocation,
};
