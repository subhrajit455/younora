const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');
const { TOKEN_AUDIENCE } = require('@younora/shared-constants');
const AdminUser = require('../../modules/users/models/adminUser.model');
const Customer = require('../../modules/users/models/customer.model');
const AppError = require('../errors/appError');
const ERROR_CODES = require('../errors/errorCodes');

/**
 * Authentication middleware
 * Verifies JWT and loads user directly from DB on every request.
 * Roles and permissions are retrieved from the database, not trusted from token.
 *
 * @param {string} expectedAudience 'younora:admin' | 'younora:customer'
 */
function authenticate(expectedAudience = TOKEN_AUDIENCE.ADMIN) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(
          new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Authentication token required')
        );
      }

      const token = authHeader.split(' ')[1];
      let decoded;

      try {
        decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
          audience: expectedAudience,
        });
      } catch (err) {
        if (err.name === 'TokenExpiredError') {
          return next(
            new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Authentication token expired')
          );
        }
        return next(
          new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Invalid authentication token')
        );
      }

      // Load live user from DB per Rule 4
      let user = null;
      if (expectedAudience === TOKEN_AUDIENCE.ADMIN) {
        user = await AdminUser.findById(decoded.sub);
      } else if (expectedAudience === TOKEN_AUDIENCE.CUSTOMER) {
        user = await Customer.findById(decoded.sub);
      }

      if (!user) {
        return next(
          new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Account no longer exists')
        );
      }

      // Check active / blocked status
      if (expectedAudience === TOKEN_AUDIENCE.ADMIN && !user.isActive) {
        return next(
          new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Account has been deactivated')
        );
      }
      if (expectedAudience === TOKEN_AUDIENCE.CUSTOMER && user.isBlocked) {
        return next(
          new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Account has been blocked')
        );
      }

      // Invalidate token if password was changed after token issuance
      if (user.passwordChangedAt) {
        const passwordChangedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (passwordChangedTimestamp > decoded.iat) {
          return next(
            new AppError(
              401,
              ERROR_CODES.UNAUTHORIZED,
              'Password was recently changed. Please log in again'
            )
          );
        }
      }

      req.user = user;
      req.tokenAudience = expectedAudience;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = authenticate;

