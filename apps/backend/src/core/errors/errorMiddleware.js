const { ZodError } = require('zod');
const AppError = require('./appError');
const ERROR_CODES = require('./errorCodes');
const logger = require('../logger');
const { env } = require('../../config/env');

// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let code = err.code || ERROR_CODES.INTERNAL_SERVER_ERROR;
  let message = err.message || 'Internal server error';
  let errors = err.errors || undefined;

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    statusCode = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'Validation failed';
    errors = err.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
  }
  // Handle Mongoose CastError (invalid ObjectId, etc.)
  else if (err.name === 'CastError') {
    statusCode = 400;
    code = ERROR_CODES.BAD_REQUEST;
    message = `Invalid ${err.path}: ${err.value}`;
  }
  // Handle Mongoose duplicate key error (E11000)
  else if (err.code === 11000) {
    statusCode = 409;
    code = ERROR_CODES.CONFLICT;
    const fields = Object.keys(err.keyValue || {}).join(', ');
    message = `Duplicate field value entered: ${fields}`;
  }
  // Handle Mongoose Validation Error
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'Database validation failed';
    errors = Object.values(err.errors || {}).map(e => ({
      field: e.path,
      message: e.message,
    }));
  }

  // Log error using structured logger
  if (statusCode >= 500) {
    logger.error({
      err,
      req: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
      },
      msg: 'Server error encountered',
    });
  } else {
    logger.warn({
      code,
      message,
      statusCode,
      req: {
        method: req.method,
        url: req.originalUrl,
      },
      msg: 'Client error response',
    });
  }

  // Response payload strictly adhering to PROJECT_RULES.md
  const responsePayload = {
    success: false,
    message,
    code,
  };

  if (errors && errors.length > 0) {
    responsePayload.errors = errors;
  }

  // In non-production, include debug stack if internal error
  if (env.NODE_ENV !== 'production' && statusCode >= 500 && !(err instanceof AppError)) {
    responsePayload.stack = err.stack;
  }

  return res.status(statusCode).json(responsePayload);
}

module.exports = errorMiddleware;

