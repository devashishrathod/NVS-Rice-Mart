const { errorHandler } = require("./errorHandler");
const { generateJwtToken } = require("./generateJwtToken");
const { verifyJwtToken } = require("./verifyJwtToken");
const {
  validateRoles,
  isAdmin,
  isVendor,
  isUser,
  isStaff,
} = require("./validateRoles");
const {
  attachServiceContext,
  applyServiceScope,
} = require("./attachServiceContext");

module.exports = {
  errorHandler,
  generateJwtToken,
  verifyJwtToken,
  validateRoles,
  isAdmin,
  isVendor,
  isUser,
  isStaff,
  attachServiceContext,
  applyServiceScope,
};
