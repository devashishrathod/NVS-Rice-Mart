exports.sendSuccess = (
  res,
  statusCode = 200,
  message = "Success",
  data = {},
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * @param {string} [code] stable machine code (constants.ERROR_CODES) — clients
 *        should branch on this, not on `message`.
 */
exports.sendError = (
  res,
  statusCode = 500,
  message = "Something went wrong",
  errorData = {},
  code,
) => {
  const body = {
    success: false,
    message,
    error: errorData,
  };
  if (code) body.code = code;
  return res.status(statusCode).json(body);
};
