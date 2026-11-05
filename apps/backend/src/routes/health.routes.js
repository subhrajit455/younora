const { Router } = require('express');
const { sendSuccess } = require('../core/http/response');
const { getDatabaseStatus } = require('../config/db');
const AppError = require('../core/errors/appError');
const ERROR_CODES = require('../core/errors/errorCodes');

const router = Router();

/**
 * @route GET /health
 * @desc Liveness probe — checks if HTTP server is running
 */
router.get('/health', (req, res) => {
  return sendSuccess(res, {
    message: 'Server is healthy',
    data: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'younora-backend',
    },
  });
});

/**
 * @route GET /health/ready
 * @desc Readiness probe — checks if database connections are operational
 */
router.get('/health/ready', (req, res, next) => {
  const dbStatus = getDatabaseStatus();

  if (dbStatus !== 'connected') {
    return next(
      new AppError(
        503,
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Database connection is not ready',
        [{ field: 'database', message: `Status is ${dbStatus}` }]
      )
    );
  }

  return sendSuccess(res, {
    message: 'Server and dependencies are ready',
    data: {
      uptime: process.uptime(),
      database: dbStatus,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;

