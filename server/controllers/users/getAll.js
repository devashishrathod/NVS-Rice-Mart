const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { getAllUsers } = require("../../services/users");
const { validateGetAllUsersQuery } = require("../../validator/users");

exports.getAll = asyncWrapper(async (req, res) => {
  const { error, value } = validateGetAllUsersQuery(req.query);
  if (error) throwError(422, cleanJoiError(error));
  const result = await getAllUsers(value);
  return sendSuccess(res, 200, "Users fetched successfully", result);
});
