const defaultPassword = process.env.DEFAULT_PASSWORD;
const User = require("../../models/User");
const { ROLES, LOGIN_TYPES } = require("../../constants");
const { asyncWrapper, sendSuccess, throwError } = require("../../utils");
const { sendOtpToMobile } = require("../../helpers/twoFactor");

exports.loginOrSignInWithMobile = asyncWrapper(async (req, res) => {
  let { mobile, loginType } = req.body;
  if (!mobile) throwError(422, "Mobile number is required");
  // 🔒 OTP signup sirf customer banata hai. `role` body se NAHI aata — warna
  // koi bhi {"role":"admin"} bhej ke admin account bana leta aur agle step
  // (verify-otp) me admin token mil jata.
  const role = ROLES.USER;
  loginType = loginType?.toLowerCase() || LOGIN_TYPES.MOBILE;
  let isFirst = false;
  let user = await User.findOne({ mobile, role, isDeleted: false }).select(
    "+password"
  );
  if (!user) {
    isFirst = true;
    // `await` zaruri hai — bina iske double-submit pe do user ban jate the
    // (prod me mobile 8088684570 ke 2 docs isi wajah se bane, 26ms ke fark se).
    user = await User.create({
      mobile,
      role,
      loginType,
      password: defaultPassword,
    });
  }
  const otpData = await sendOtpToMobile(mobile);
  return sendSuccess(
    res,
    200,
    "OTP has been sent to your Mobile. Please check your inbox.",
    { otpData, isFirst }
  );
});
