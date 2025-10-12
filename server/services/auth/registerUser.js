const User = require("../../models/User");
const { ROLES } = require("../../constants");
const { throwError } = require("../../utils");

exports.registerUser = async (payload) => {
  let { name, email, mobile, password, role, fcmToken } = payload;
  name = name?.toLowerCase();
  email = email?.toLowerCase();
  role = role?.toLowerCase() || ROLES.USER;
  let user;
  if (email) {
    user = await User.findOne({
      email: email,
      role: role,
      isDeleted: false,
    });
    if (user) throwError(400, "User with this email already exists");
  } else if (!user && mobile) {
    user = await User.findOne({
      mobile: mobile,
      role: role,
      isDeleted: false,
    });
    if (user) throwError(400, "User with this mobile number already exists");
  }
  const userData = {
    name,
    password,
    email,
    mobile,
    role,
    fcmToken,
  };
  user = await User.create(userData);
  const token = user.getSignedJwtToken();
  return { user, token };
};
