const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { upsertSetting } = require("../../services/settings");
const { getSetting } = require("../../services/settings");
const { validateUpsertSetting } = require("../../validator/settings");

exports.update = asyncWrapper(async (req, res) => {
  const { error, value } = validateUpsertSetting(req.body);
  if (error) throwError(422, cleanJoiError(error));
  await upsertSetting(value);
  const result = await getSetting();
  return sendSuccess(res, 200, "Setting updated successfully", result);
});
