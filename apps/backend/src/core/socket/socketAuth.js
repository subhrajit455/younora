const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');
const { TOKEN_AUDIENCE } = require('@younora/shared-constants');
const AdminUser = require('../../modules/users/models/adminUser.model');
const Customer = require('../../modules/users/models/customer.model');

/**
 * Socket.IO handshake authentication middleware.
 * Verifies JWT against live DB user (Rule 4: database-backed auth).
 */
async function socketAuthMiddleware(socket, next) {
  try {
    const authHeader = socket.handshake.headers?.authorization;
    const token =
      socket.handshake.auth?.token ||
      (authHeader && authHeader.startsWith('Bearer ') && authHeader.split(' ')[1]);

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        audience: [TOKEN_AUDIENCE.ADMIN, TOKEN_AUDIENCE.CUSTOMER],
      });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new Error('Authentication token expired'));
      }
      return next(new Error('Invalid authentication token'));
    }

    const tokenAudience = decoded.aud;
    let user = null;

    if (tokenAudience === TOKEN_AUDIENCE.ADMIN) {
      user = await AdminUser.findById(decoded.sub);
    } else if (tokenAudience === TOKEN_AUDIENCE.CUSTOMER) {
      user = await Customer.findById(decoded.sub);
    }

    if (!user) {
      return next(new Error('Account no longer exists'));
    }

    if (tokenAudience === TOKEN_AUDIENCE.ADMIN && !user.isActive) {
      return next(new Error('Account has been deactivated'));
    }

    if (tokenAudience === TOKEN_AUDIENCE.CUSTOMER && user.isBlocked) {
      return next(new Error('Account has been blocked'));
    }

    if (user.passwordChangedAt) {
      const passwordChangedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (passwordChangedTimestamp > decoded.iat) {
        return next(new Error('Password was recently changed. Please reconnect'));
      }
    }

    socket.user = user;
    socket.tokenAudience = tokenAudience;
    next();
  } catch {
    next(new Error('Internal socket authentication error'));
  }
}

module.exports = socketAuthMiddleware;

