const { asyncWrapper, sendSuccess } = require("../../utils");
const { registerUser } = require("../../services/auth");

exports.register = asyncWrapper(async (req, res) => {
  const { user, token } = await registerUser(req.body);
  return sendSuccess(res, 201, "User registered successfully", { user, token });
});
