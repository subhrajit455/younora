const express = require('express');
const rateLimit = require('express-rate-limit');
const storeBatchController = require('./storeBatch.controller');
const AppError = require('../../core/errors/appError');
const ERROR_CODES = require('../../core/errors/errorCodes');

const storeBatchRouter = express.Router();

const batchLookupRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new AppError(
        429,
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        'Too many batch lookup requests, please try again shortly'
      )
    );
  },
});

storeBatchRouter.get('/:batchNo', batchLookupRateLimiter, (req, res, next) =>
  storeBatchController.getPublicBatch(req, res, next)
);

module.exports = storeBatchRouter;

