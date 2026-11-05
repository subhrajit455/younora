const ERROR_CODES = require('./errorCodes');

class AppError extends Error {
  constructor(statusCode, code, message, errors = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code || ERROR_CODES.INTERNAL_SERVER_ERROR;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errors = null, code = ERROR_CODES.BAD_REQUEST) {
    return new AppError(400, code, message, errors);
  }

  static unauthorized(message = 'Authentication required', code = ERROR_CODES.UNAUTHORIZED) {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'Access forbidden: insufficient permissions', code = ERROR_CODES.FORBIDDEN) {
    return new AppError(403, code, message);
  }

  static notFound(message = 'Resource not found', code = ERROR_CODES.NOT_FOUND) {
    return new AppError(404, code, message);
  }

  static conflict(message, code = ERROR_CODES.CONFLICT) {
    return new AppError(409, code, message);
  }

  static internal(message = 'An unexpected internal error occurred', code = ERROR_CODES.INTERNAL_SERVER_ERROR) {
    return new AppError(500, code, message);
  }
}

module.exports = AppError;

