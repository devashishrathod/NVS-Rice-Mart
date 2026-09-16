const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { createLocation } = require("../../services/locations");
const { validateCreateLocation } = require("../../validator/locations");

exports.create = asyncWrapper(async (req, res) => {
  // 🆕 Pehle is route pe koi validation thi hi nahi — `validateCreateLocation`
  // likhi hui thi par kabhi call nahi hoti thi.
  const { error, value } = validateCreateLocation(req.body);
  if (error) throwError(422, cleanJoiError(error));

  const result = await createLocation(
    { userId: req.userId, role: req.role },
    value,
  );
  return sendSuccess(res, 201, "Location created successfully", result);
});
