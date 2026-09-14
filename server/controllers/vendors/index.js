const {
  asyncWrapper,
  sendSuccess,
  throwError,
  cleanJoiError,
  validateObjectId,
} = require("../../utils");
const { ROLES } = require("../../constants");
const {
  createVendor,
  getAllVendors,
  getVendor,
  updateVendor,
  updateVendorDelivery,
  updateVendorStatus,
  getBranches,
  createBranch,
  setDefaultBranch,
} = require("../../services/vendors");
const {
  getServiceAreas,
  addServiceAreas,
  removeServiceArea,
} = require("../../services/serviceAreas");
const {
  validateCreateVendor,
  validateUpdateVendor,
  validateUpdateVendorDelivery,
  validateUpdateVendorStatus,
  validateCreateBranch,
  validateGetAllVendorsQuery,
} = require("../../validator/vendors");
const {
  validateAddServiceAreas,
  validateGetServiceAreasQuery,
} = require("../../validator/serviceAreas");

/** Admin sab, vendor sirf apna. */
const assertSelfOrAdmin = (req, vendorId) => {
  validateObjectId(vendorId, "Vendor Id");
  if (req.role === ROLES.ADMIN || req.role === ROLES.STAFF) return;
  if (req.role === ROLES.VENDOR && String(req.userId) === String(vendorId)) {
    return;
  }
  throwError(403, "Forbidden: you can only access your own vendor account");
};

exports.create = asyncWrapper(async (req, res) => {
  const { error, value } = validateCreateVendor(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const result = await createVendor(value);
  return sendSuccess(res, 201, "Vendor created successfully", result);
});

exports.getAll = asyncWrapper(async (req, res) => {
  const { error } = validateGetAllVendorsQuery(req.query);
  if (error) throwError(422, cleanJoiError(error));
  const result = await getAllVendors(req.query);
  return sendSuccess(res, 200, "Vendors fetched successfully", result);
});

exports.get = asyncWrapper(async (req, res) => {
  assertSelfOrAdmin(req, req.params?.id);
  const result = await getVendor(req.params.id);
  return sendSuccess(res, 200, "Vendor fetched successfully", result);
});

exports.update = asyncWrapper(async (req, res) => {
  const { error, value } = validateUpdateVendor(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const result = await updateVendor(req.params?.id, value, {
    userId: req.userId,
    role: req.role,
  });
  return sendSuccess(res, 200, "Vendor updated successfully", result);
});

/**
 * 🏪 Vendor apni delivery settings khud badalta hai. Admin bhi kar sakta hai
 * (support ke liye) `PUT /vendors/update/:id` se.
 */
exports.updateMyDelivery = asyncWrapper(async (req, res) => {
  const { error, value } = validateUpdateVendorDelivery(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const result = await updateVendorDelivery(req.userId, value);
  return sendSuccess(res, 200, "Delivery settings updated", result);
});

exports.updateStatus = asyncWrapper(async (req, res) => {
  const { error, value } = validateUpdateVendorStatus(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const result = await updateVendorStatus(req.params?.id, value.status);
  return sendSuccess(res, 200, "Vendor status updated", result);
});

// ── Branches ────────────────────────────────────────────────
exports.listBranches = asyncWrapper(async (req, res) => {
  assertSelfOrAdmin(req, req.params?.id);
  const result = await getBranches(req.params.id);
  return sendSuccess(res, 200, "Branches fetched successfully", result);
});

exports.addBranch = asyncWrapper(async (req, res) => {
  const { error, value } = validateCreateBranch(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const result = await createBranch(req.params?.id, value);
  return sendSuccess(res, 201, "Branch created successfully", result);
});

exports.makeBranchDefault = asyncWrapper(async (req, res) => {
  const result = await setDefaultBranch(
    req.params?.id,
    req.params?.locationId,
  );
  return sendSuccess(res, 200, "Default pickup branch updated", result);
});

// ── Service areas ───────────────────────────────────────────
exports.listServiceAreas = asyncWrapper(async (req, res) => {
  assertSelfOrAdmin(req, req.params?.id);
  const { error } = validateGetServiceAreasQuery(req.query);
  if (error) throwError(422, cleanJoiError(error));
  const result = await getServiceAreas(req.params.id, req.query);
  return sendSuccess(res, 200, "Service areas fetched successfully", result);
});

exports.addAreas = asyncWrapper(async (req, res) => {
  const { error, value } = validateAddServiceAreas(req.body);
  if (error) throwError(422, cleanJoiError(error));
  const result = await addServiceAreas(req.params?.id, value);
  return sendSuccess(res, 201, "Service areas saved successfully", result);
});

exports.removeArea = asyncWrapper(async (req, res) => {
  const result = await removeServiceArea(req.params?.id, req.params?.areaId);
  return sendSuccess(res, 200, "Service area removed successfully", result);
});
