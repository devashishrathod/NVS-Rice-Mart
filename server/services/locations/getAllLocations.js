const { default: mongoose } = require("mongoose");
const Location = require("../../models/Location");
const { ROLES } = require("../../constants");
const {
  pagination,
  validateObjectId,
  throwError,
  ciExact,
  escapeRegex,
} = require("../../utils");

/**
 * @param {object} query
 * @param {{ userId: any, role: string }} actor  REQUIRED — iske bina scoping
 *        nahi lagti aur har user sabke addresses padh leta hai.
 */
exports.getAllLocations = async (query, actor) => {
  let {
    page,
    limit,
    search,
    name,
    shopOrBuildingNumber,
    userId,
    address,
    area,
    city,
    district,
    state,
    zipcode,
    country,
    isProductAddress,
    isDefault,
    isActive,
    fromDate,
    toDate,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;
  page = page ? Number(page) : 1;
  limit = limit ? Number(limit) : 10;
  const match = { isDeleted: false };
  if (typeof isActive !== "undefined") {
    match.isActive = isActive === "true" || isActive === true;
  }
  if (typeof isProductAddress !== "undefined") {
    match.isProductAddress =
      isProductAddress === "true" || isProductAddress === true;
  }
  if (typeof isDefault !== "undefined") {
    match.isDefault = isDefault === "true" || isDefault === true;
  }
  // 🔤 Exact-match filters ab CASE-INSENSITIVE hain. Pehle ye query value ko
  //    lowercase karke exact match karte the — wo sirf isliye chalta tha ki
  //    DB me saara data lowercase pada tha. Ab "Davangere" save hota hai,
  //    isliye `?city=davangere` bhi usi doc ko mile.
  if (city) match.city = ciExact(city);
  if (district) match.district = ciExact(district);
  if (state) match.state = ciExact(state);
  if (country) match.country = ciExact(country);
  // `zipcode` digits hai — casing ka sawaal hi nahi. Plain exact match
  // rakha hai taaki `{ zipcode: 1, isDeleted: 1 }` index use hota rahe
  // (regex us index ko bekaar kar deta).
  if (zipcode) match.zipcode = String(zipcode).trim();
  if (userId) {
    validateObjectId(userId, "User Id");
    match.userId = new mongoose.Types.ObjectId(userId);
  }

  // 🔒 `escapeRegex` — pehle user ka input seedha `new RegExp()` me jata tha.
  //    `?search=(a+)+$` jaisa input catastrophic backtracking laga sakta tha.
  const like = (v) => ({ $regex: new RegExp(escapeRegex(v), "i") });

  if (name) match.name = like(name);
  if (address) match.address = like(address);
  if (area) match.area = like(area);
  if (shopOrBuildingNumber) {
    match.shopOrBuildingNumber = like(shopOrBuildingNumber);
  }
  if (search) {
    match.$or = [
      { name: like(search) },
      { shopOrBuildingNumber: like(search) },
      { address: like(search) },
      { area: like(search) },
      { city: like(search) },
      { district: like(search) },
      { state: like(search) },
      { zipcode: like(search) },
      { country: like(search) },
    ];
  }
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const d = new Date(toDate);
      d.setHours(23, 59, 59, 999);
      match.createdAt.$lte = d;
    }
  }
  // 🔒 Scoping sabse aakhir me — client ka `userId` param ise override na kare.
  // Address personal data hai: customer/vendor sirf apne dekhein, admin sab.
  if (!actor?.role) throwError(401, "Access Denied! Missing user context");
  if (actor.role !== ROLES.ADMIN && actor.role !== ROLES.STAFF) {
    match.userId = new mongoose.Types.ObjectId(actor.userId);
  }

  const pipeline = [{ $match: match }];
  const sortStage = {};
  sortStage[sortBy] = sortOrder === "asc" ? 1 : -1;
  pipeline.push({ $sort: sortStage });
  return await pagination(Location, pipeline, page, limit);
};
