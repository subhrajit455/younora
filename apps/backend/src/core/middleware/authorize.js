const { ROLES } = require('@younora/shared-constants');
const AppError = require('../errors/appError');
const ERROR_CODES = require('../errors/errorCodes');

/**
 * Role-based authorization middleware
 * @param {...string} allowedRoles
 */
function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          ERROR_CODES.FORBIDDEN,
          'Access denied: insufficient role privileges'
        )
      );
    }
    next();
  };
}

/**
 * Granular permission-based authorization middleware
 * SUPER_ADMIN bypasses all permission checks.
 *
 * @param {string} permission
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        new AppError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          'Authentication required'
        )
      );
    }

    // Super Admin role bypasses permission checks
    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next();
    }

    const hasPermission =
      Array.isArray(req.user.permissions) &&
      req.user.permissions.includes(permission);

    if (!hasPermission) {
      return next(
        new AppError(
          403,
          ERROR_CODES.FORBIDDEN,
          `Access denied: requires '${permission}' permission`
        )
      );
    }

    next();
  };
}

module.exports = {
  authorizeRole,
  requirePermission,
};

