const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const {
  updateLocation,
  setDefaultLocation,
} = require("../../services/locations");
const { validateUpdateLocation } = require("../../validator/locations");

exports.update = asyncWrapper(async (req, res) => {
  const { error, value } = validateUpdateLocation(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const result = await updateLocation(req.params?.id, value, {
    userId: req.userId,
    role: req.role,
  });
  return sendSuccess(res, 200, "Location updated successfully", result);
});

exports.setDefault = asyncWrapper(async (req, res) => {
  const result = await setDefaultLocation(req.params?.id, {
    userId: req.userId,
    role: req.role,
  });
  return sendSuccess(res, 200, "Default address updated", result);
});
