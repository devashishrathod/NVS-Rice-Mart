const Location = require("../../models/Location");
const { validateObjectId, throwError } = require("../../utils");
const { isValidZipCode } = require("../../validator/common");
const { getLocationDetailsFromCoords } = require("../../helpers/locations");

exports.createLocation = async (payload) => {
  let {
    userId,
    name,
    shopOrBuildingNumber,
    address,
    area,
    state,
    city,
    district,
    country,
    zipCode,
    coordinates,
  } = payload;
  let locationData = payload;
  if (userId) validateObjectId(userId, "User Id");
  country = country?.toLowerCase() || "india";
  if (!coordinates) {
    if (!address || !city || !district || !zipCode || !state) {
      throwError(
        422,
        "Please pass coordinates(Lat & Long) Or provide address, city, district, zipCode and state "
      );
    }
    if (zipCode && !isValidZipCode(country, zipCode)) {
      throwError(
        422,
        `${zipCode} is not a valid ZIP/postal code for ${country}`
      );
    }
    locationData = {
      userId,
      name: name?.toLowerCase(),
      shopOrBuildingNumber: shopOrBuildingNumber?.toLowerCase(),
      address: address?.toLowerCase(),
      area: area?.toLowerCase(),
      city: city?.toLowerCase(),
      district: district?.toLowerCase(),
      zipCode,
      state: state?.toLowerCase(),
      country: country?.toLowerCase(),
      formattedAddress:
        `${address?.toLowerCase()}, ${city?.toLowerCase()}, ${district?.toLowerCase()}, ${state?.toLowerCase()}, ${zipCode}, ${country?.toLowerCase()}`.trim(),
      coordinates: [0, 0],
    };
  } else {
    const [lat, lon] = coordinates;
    const autoData = await getLocationDetailsFromCoords(lat, lon);
    console.log("loc", autoData);
    if (!autoData) throwError(422, "please provide correct coordinates");
    locationData.coordinates = [autoData?.lat, autoData?.lon];
    locationData.formattedAddress = autoData?.formattedAddress;
    locationData.name = autoData?.name;
    locationData.address = autoData?.address;
    locationData.area = autoData?.area;
    locationData.city = autoData?.city;
    locationData.district = autoData?.district;
    locationData.zipCode = autoData?.zipCode;
    locationData.state = autoData?.state;
    locationData.country = autoData?.country;
  }
  return await Location.create(locationData);
};
