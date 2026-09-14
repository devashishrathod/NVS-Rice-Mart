const { asyncWrapper, sendSuccess, throwError } = require("../../utils");
const { getUserById } = require("../../services/users");
const { ROLES } = require("../../constants");

exports.getUser = asyncWrapper(async (req, res) => {
  // 🔒 `?userId=` sirf admin ke liye. Pehle koi bhi logged-in user kisi ka
  // bhi profile (email/mobile ke saath) nikal sakta tha.
  let userId = req.userId;
  if (req.query?.userId && String(req.query.userId) !== String(req.userId)) {
    if (req.role !== ROLES.ADMIN && req.role !== ROLES.STAFF) {
      throwError(403, "Forbidden: You can only view your own profile");
    }
    userId = req.query.userId;
  }
  const user = await getUserById(userId);
  return sendSuccess(res, 200, "User fetched successfully", user);
});
