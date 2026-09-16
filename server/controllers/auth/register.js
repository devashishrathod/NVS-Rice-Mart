const User = require("../../models/User");
const { ROLES, LOGIN_TYPES } = require("../../constants");
const {
  asyncWrapper,
  sendSuccess,
  throwError,
  toTitleCase,
} = require("../../utils");

exports.register = asyncWrapper(async (req, res) => {
  let { name, email, password, mobile, loginType, fcmToken } = req.body;
  if (!mobile && !email) {
    throwError(422, "Email or Mobile number any one of this is required");
  }
  // 🔒 `email` lowercase HI rehta hai — neeche `findOne({ email })` exact
  //    match karta hai. Hata dete to "Foo@x.com" se banaya account
  //    "foo@x.com" se login nahi kar pata aur duplicate ban jate.
  email = email?.toLowerCase();
  // `name` display field hai — ab proper case me save hota hai.
  name = toTitleCase(name);
  // 🔒 Public signup hamesha customer banata hai. `role` body se NAHI aata —
  // warna koi bhi {"role":"admin"} bhej ke admin ban jata.
  // Vendor sirf POST /vendors/create (isAdmin) se banega.
  const role = ROLES.USER;
  loginType = loginType?.toLowerCase() || LOGIN_TYPES.PASSWORD;
  let user;
  if (email) {
    user = await User.findOne({ email, role, isDeleted: false });
    if (user) throwError(400, "User with this email already exists");
  }
  if (mobile) {
    user = await User.findOne({ mobile, role, isDeleted: false });
    if (user) throwError(400, "User with mobile number already exists");
  }
  const userData = {
    name,
    password,
    email,
    mobile,
    role,
    fcmToken,
    loginType,
    isLoggedIn: true,
    isOnline: true,
  };
  user = await User.create(userData);
  const token = user.getSignedJwtToken();
  // `create()` ka doc password rakhta hai (select: false sirf query pe lagta
  // hai), isliye response banane se pehle hata do.
  const { password: _pw, otp: _otp, ...safeUser } = user.toObject();
  return sendSuccess(res, 201, "User registered successfully", {
    user: safeUser,
    token,
  });
});
