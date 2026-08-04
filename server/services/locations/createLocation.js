const User = require("../../models/User");
const Location = require("../../models/Location");
const { validateObjectId, throwError } = require("../../utils");
const { isValidZipCode } = require("../../validator/common");
const { getLocationDetailsFromCoords } = require("../../helpers/locations");

exports.createLocation = async (tokenUserId, payload) => {
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
    zipcode,
    formattedAddress,
    coordinates,
    isProductAddress,
    isVendorAddress,
  } = payload;
  let locationData = payload;
  userId = userId || tokenUserId;
  if (userId) validateObjectId(userId, "User Id");
  const user = await User.findById(userId);
  if (!user || user.isDeleted) throwError(404, "User not found");
  country = country?.toLowerCase() || "india";
  // if (!coordinates) {
  if (!address || !city || !district || !zipcode || !state || !coordinates) {
    throwError(
      422,
      "Please provide coordinates(Lat & Long), address, city, district, zipcode, state.",
    );
  }
  if (zipcode && !isValidZipCode(country, zipcode)) {
    throwError(422, `${zipcode} is not a valid ZIP/postal code for ${country}`);
  }
  locationData = {
    userId,
    name: name?.toLowerCase(),
    shopOrBuildingNumber: shopOrBuildingNumber?.toLowerCase(),
    address: address?.toLowerCase(),
    area: area?.toLowerCase(),
    city: city?.toLowerCase(),
    district: district?.toLowerCase(),
    zipcode,
    state: state?.toLowerCase(),
    country: country?.toLowerCase(),
    formattedAddress: formattedAddress
      ? formattedAddress?.toLowerCase()
      : `${address?.toLowerCase()}, ${city?.toLowerCase()}, ${district?.toLowerCase()}, ${state?.toLowerCase()}, ${zipcode}, ${country?.toLowerCase()}`.trim(),
    coordinates,
   // isProductAddress: isProductAddress || false,
    isVendorAddress: isVendorAddress,
  };
  // } else {
  //   const [lat, lon] = coordinates;
  //   const autoData = await getLocationDetailsFromCoords(lat, lon);
  //   if (!autoData) throwError(422, "please provide correct coordinates");
  //   locationData.coordinates = [autoData?.lat, autoData?.lon];
  //   locationData.formattedAddress = autoData?.formattedAddress;
  //   locationData.name = autoData?.name;
  //   locationData.address = autoData?.address;
  //   locationData.area = autoData?.area;
  //   locationData.city = autoData?.city;
  //   locationData.district = autoData?.district;
  //   locationData.zipcode = autoData?.zipcode;
  //   locationData.state = autoData?.state;
  //   locationData.country = autoData?.country;
  // }
  const location = await Location.create(locationData);
  user.locationId = location._id;
  await user.save();
  return location;
};
