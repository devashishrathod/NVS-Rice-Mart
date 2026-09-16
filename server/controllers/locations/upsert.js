const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const { upsertLocation } = require("../../services/locations");
const { validateUpsertLocation } = require("../../validator/locations");

/**
 * 🆕 `PUT /locations/upsert` — "mera address save kar do".
 *
 * Status hamesha 200 rehta hai (201 nahi), aur `created` flag batata hai ki
 * naya bana ya purana update hua — frontend ko do alag code handle nahi
 * karne padte.
 */
exports.upsert = asyncWrapper(async (req, res) => {
  const { error, value } = validateUpsertLocation(req.body);
  if (error) throwError(422, cleanJoiError(error));

  const { created, promoted, location } = await upsertLocation(
    { userId: req.userId, role: req.role },
    value,
  );

  return sendSuccess(
    res,
    200,
    created ? "Address saved successfully" : "Address updated successfully",
    { created, promoted, location },
  );
});
