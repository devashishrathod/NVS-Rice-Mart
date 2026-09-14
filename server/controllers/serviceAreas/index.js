const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
} = require("../../utils");
const {
  checkServiceability,
  lookupServiceArea,
  reassignServiceArea,
} = require("../../services/serviceAreas");
const {
  validateZipcodeQuery,
  validateReassignServiceArea,
} = require("../../validator/serviceAreas");

/** Customer-facing — app ka pehla call, address save karne se pehle. */
exports.check = asyncWrapper(async (req, res) => {
  const { error } = validateZipcodeQuery(req.query);
  if (error) throwError(422, cleanJoiError(error));
  const result = await checkServiceability(req.query.zipcode);
  return sendSuccess(res, 200, "Delivery available", result);
});

/** Admin — pincode assign karne se pehle check. */
exports.lookup = asyncWrapper(async (req, res) => {
  const { error } = validateZipcodeQuery(req.query);
  if (error) throwError(422, cleanJoiError(error));
  const result = await lookupServiceArea(req.query.zipcode);
  return sendSuccess(res, 200, "Lookup completed", result);
});

/** Admin — territory transfer. */
exports.reassign = asyncWrapper(async (req, res) => {
  const { error, value } = validateReassignServiceArea(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const result = await reassignServiceArea(value);
  return sendSuccess(res, 200, "Service area reassigned successfully", result);
});
