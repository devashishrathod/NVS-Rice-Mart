const axios = require("axios");
const LOCATION_API = process.env.LOCATION_API;
const LOCATION_HEADER = process.env.LOCATION_HEADER;
const { getDistrictOrCityPostcode } = require("./getDistrictOrCityPostcode");
const { toTitleCase } = require("../../utils/textCase");

exports.getLocationDetailsFromCoords = async (lat, lon) => {
  try {
    const url = `${LOCATION_API}?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": `${LOCATION_HEADER}`,
      },
    });
    if (!data || !data.address) return null;
    const addr = data?.address;

    // 🎁 Nominatim pehle se proper case bhejta hai — "Davangere",
    //    "Karnataka", "India". Pehle hum use jaan-boojh ke lowercase kar
    //    dete the. Ab wo casing seedha kaam aa jati hai.
    //    `toTitleCase` yahan safety net hai: mixed-case value ko chhoda
    //    jata hai, aur kabhi API ALL-CAPS de de to wo bhi theek ho jaye.
    const city =
      toTitleCase(addr?.city) ||
      toTitleCase(addr?.city_district) ||
      toTitleCase(addr?.town) ||
      toTitleCase(addr?.village) ||
      null;
    const district = toTitleCase(addr?.state_district) || null;
    const country = toTitleCase(addr?.country) || null;

    // Pehle ye template-string tha — khali parts se double space reh jata
    // tha ("road  suburb").
    const address = [addr?.road, addr?.village, addr?.suburb]
      .map((p) => toTitleCase(p))
      .filter(Boolean)
      .join(" ");

    return {
      lat: data?.lat,
      lon: data?.lon,
      formattedAddress: toTitleCase(data?.display_name) || null,
      name: toTitleCase(data?.name) || null,
      address,
      area: toTitleCase(addr?.county) || null,
      city,
      district,
      // zipcode pe casing nahi — digits/alphanumeric code hai
      zipcode:
        addr?.postcode?.trim() ||
        (await getDistrictOrCityPostcode(country, district, city)) ||
        null,
      state: toTitleCase(addr?.state) || null,
      country,
    };
  } catch (err) {
    console.error("Reverse geocode error →", err.message);
    return null;
  }
};
