const asyncWrapper = require("./asyncWrapper");
const { throwError, CustomError } = require("./CustomError");
const { sendSuccess, sendError } = require("./response");
const { pagination } = require("./pagination");
const { generateOTP } = require("./generateOTP");
const { validateObjectId } = require("./validateObjectId");
const { cleanJoiError } = require("./cleanJoiError");
const {
  toTitleCase,
  toSentenceCase,
  normalizeForCompare,
  ciExact,
  escapeRegex,
  STATE_ABBR,
} = require("./textCase");

module.exports = {
  CustomError,
  asyncWrapper,
  cleanJoiError,
  sendSuccess,
  sendError,
  throwError,
  pagination,
  generateOTP,
  validateObjectId,
  toTitleCase,
  toSentenceCase,
  normalizeForCompare,
  ciExact,
  escapeRegex,
  STATE_ABBR,
};
