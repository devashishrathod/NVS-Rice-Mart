const { ZIP_CODE_REGEX_MAP, COUNTRY_NAME_TO_ISO } = require("../constants");

module.exports = {
  isValidEmail: (email) =>
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email),

  isValidPhoneNumber: (phone) => /^\+?[1-9]\d{1,14}$/.test(phone), // E.164 format

  isValidURL: (url) =>
    /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/.test(url),

  isValidZipCode: (country, zipCode) => {
    if (!country || !zipCode) return false;
    const countryCode = country.toUpperCase();
    const isoCode = ZIP_CODE_REGEX_MAP[countryCode]
      ? countryCode
      : COUNTRY_NAME_TO_ISO[countryCode.replace(/\s/g, "").toLowerCase()];
    if (!isoCode) return true; // skip validation for unsupported countries
    const regex = ZIP_CODE_REGEX_MAP[isoCode];
    return regex ? regex.test(zipCode) : true;
  },
};
