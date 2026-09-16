const mongoose = require("mongoose");
const User = require("../../models/User");
const Location = require("../../models/Location");
const VendorProfile = require("../../models/VendorProfile");
const {
  ROLES,
  LOGIN_TYPES,
  LOCATION_TYPES,
  VENDOR_STATUS,
  DEFAULT_COUNTRY,
} = require("../../constants");
const { throwError, toTitleCase } = require("../../utils");
const { isValidZipCode } = require("../../validator/common");
const { buildFormattedAddress } = require("../../helpers/locations");

/**
 * Vendor = User(role=vendor) + VendorProfile + pehla branch.
 * Teeno ek transaction me — aadha vendor kabhi nahi banna chahiye.
 *
 * Pehla branch automatically `isDefault: true` hota hai, kyunki delivery
 * distance usi se nikalti hai. Default na ho to har order 503 dega.
 */
exports.createVendor = async (payload) => {
  let {
    shopName,
    name,
    email,
    mobile,
    password,
    legalName,
    gstNumber,
    fssaiNumber,
    supportMobile,
    logo,
    commissionPercent,
    delivery,
    payout,
    branch,
  } = payload;

  if (!email && !mobile) {
    throwError(422, "Email or mobile is required for the vendor login");
  }
  // 🔒 `email` lowercase HI rehta hai — `findOne({ email })` exact match
  //    karta hai, isliye ye normalization functional hai, cosmetic nahi.
  email = email?.toLowerCase();
  // `name` display field hai — ab proper case me.
  name = toTitleCase(name) || toTitleCase(shopName);

  // Uniqueness role ke andar — ek hi mobile customer aur vendor dono ka ho
  // sakta hai (auth lookup bhi `{ mobile, role }` se hota hai).
  if (email) {
    const clash = await User.findOne({
      email,
      role: ROLES.VENDOR,
      isDeleted: false,
    }).lean();
    if (clash) throwError(409, "A vendor with this email already exists");
  }
  if (mobile) {
    const clash = await User.findOne({
      mobile,
      role: ROLES.VENDOR,
      isDeleted: false,
    }).lean();
    if (clash) throwError(409, "A vendor with this mobile already exists");
  }

  if (!branch) throwError(422, "The first branch is required");
  const {
    address,
    city,
    district,
    state,
    zipcode,
    coordinates,
    country = DEFAULT_COUNTRY,
  } = branch;
  if (!address || !city || !district || !state || !zipcode || !coordinates) {
    throwError(
      422,
      "Branch needs address, city, district, state, zipcode and coordinates(Lat & Long)",
    );
  }
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    throwError(422, "Branch coordinates must be [latitude, longitude]");
  }
  if (!isValidZipCode(country, zipcode)) {
    throwError(422, `${zipcode} is not a valid ZIP/postal code for ${country}`);
  }

  // Display fields proper case me — `zipcode`/`coordinates` chhod ke.
  const branchFields = {
    name: toTitleCase(branch.name) || toTitleCase(shopName),
    shopOrBuildingNumber: toTitleCase(branch.shopOrBuildingNumber),
    address: toTitleCase(address),
    area: toTitleCase(branch.area),
    city: toTitleCase(city),
    district: toTitleCase(district),
    state: toTitleCase(state),
    country: toTitleCase(country),
  };

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [vendor] = await User.create(
      [
        {
          name,
          email,
          mobile,
          password,
          role: ROLES.VENDOR,
          loginType: LOGIN_TYPES.PASSWORD,
          isSignUpCompleted: true,
          isActive: true,
        },
      ],
      { session },
    );

    const [firstBranch] = await Location.create(
      [
        {
          userId: vendor._id,
          type: LOCATION_TYPES.VENDOR_BRANCH,
          ...branchFields,
          zipcode,
          formattedAddress:
            toTitleCase(branch.formattedAddress) ||
            buildFormattedAddress({ ...branchFields, zipcode }),
          coordinates,
          isDefault: true, // 📍 pickup point
          isActive: true,
        },
      ],
      { session },
    );

    const [profile] = await VendorProfile.create(
      [
        {
          vendorId: vendor._id,
          shopName,
          legalName,
          gstNumber,
          fssaiNumber,
          supportMobile,
          logo,
          defaultLocationId: firstBranch._id,
          delivery: delivery || {},
          commissionPercent: commissionPercent ?? 0,
          payout,
          status: VENDOR_STATUS.APPROVED,
        },
      ],
      { session },
    );

    // Vendor ka apna "default location" pointer bhi set kar do
    vendor.locationId = firstBranch._id;
    await vendor.save({ session });

    await session.commitTransaction();

    const { password: _pw, otp: _otp, ...safeVendor } = vendor.toObject();
    return { vendor: safeVendor, profile, branch: firstBranch };
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
