const {
  getLocationDetailsFromCoords,
} = require("./getLocationDetailsFromCoords");
const { getDistrictOrCityPostcode } = require("./getDistrictOrCityPostcode");
const { buildFormattedAddress } = require("./buildFormattedAddress");

module.exports = {
  getLocationDetailsFromCoords,
  getDistrictOrCityPostcode,
  buildFormattedAddress,
};
