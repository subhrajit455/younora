const AppError = require('../errors/appError');
const ERROR_CODES = require('../errors/errorCodes');

function notFoundHandler(req, res, next) {
  next(
    new AppError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Route ${req.method} ${req.originalUrl} not found`
    )
  );
}

module.exports = notFoundHandler;

