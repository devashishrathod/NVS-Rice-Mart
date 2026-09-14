class CustomError extends Error {
  /**
   * @param {number} statusCode HTTP status
   * @param {string} message    human readable message
   * @param {string} [code]     stable machine code (see constants.ERROR_CODES)
   * @param {object} [data]     extra payload for the client
   */
  constructor(statusCode, message, code, data) {
    super(message);
    this.statusCode = statusCode;
    if (code) this.code = code;
    if (data) this.data = data;
  }
}

const throwError = (statusCode, message, code, data) => {
  throw new CustomError(statusCode, message, code, data);
};

module.exports = { throwError, CustomError };
