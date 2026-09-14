const defaultPassword = process.env.DEFAULT_PASSWORD;
const User = require("../../models/User");
const { ROLES, LOGIN_TYPES } = require("../../constants");
const {
  asyncWrapper,
  sendSuccess,
  throwError,
  generateOTP,
} = require("../../utils");
const { sendLoginOtpMail } = require("../../helpers/nodeMailer");

exports.loginOrSignInWithEmail = asyncWrapper(async (req, res) => {
  let { email, loginType } = req.body;
  if (!email) throwError(422, "Email is required");
  email = email?.toLowerCase();
  // 🔒 OTP signup sirf customer banata hai — role body se nahi aata.
  const role = ROLES.USER;
  loginType = loginType?.toLowerCase() || LOGIN_TYPES.EMAIL;
  const updatedData = {
    code: generateOTP(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  };
  let isFirst = false;
  let user = await User.findOne({ email, role, isDeleted: false }).select(
    "+password"
  );
  if (!user) {
    isFirst = true;
    // `await` zaruri hai — bina iske double-submit pe duplicate user ban jate hain
    user = await User.create({
      email,
      role,
      loginType,
      password: defaultPassword,
      otp: updatedData,
    });
  } else {
    user.otp = updatedData;
    user = await user.save();
  }
  sendLoginOtpMail(email, updatedData.code);
  return sendSuccess(
    res,
    200,
    "OTP has been sent to your Email. Please check your inbox.",
    { isFirst }
  );
});
