const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');
const { USER_TYPES, TOKEN_AUDIENCE } = require('@younora/shared-constants');
const AdminUser = require('../users/models/adminUser.model');
const RefreshToken = require('../users/models/refreshToken.model');
const { hashToken, generateRandomToken, generateTokenFamily } = require('../../core/utils/crypto');
const AppError = require('../../core/errors/appError');
const ERROR_CODES = require('../../core/errors/errorCodes');

class AuthService {
  /**
   * Admin Login
   */
  static async loginAdmin({ email, password, ip, userAgent }) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await AdminUser.findOne({ email: normalizedEmail }).select('+passwordHash');

    // Generic error to prevent user enumeration
    const invalidCredentialsError = new AppError(
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Invalid email or password'
    );

    if (!user) {
      throw invalidCredentialsError;
    }

    // Check account lockout
    if (user.isLocked()) {
      throw new AppError(
        401,
        ERROR_CODES.UNAUTHORIZED,
        'Account temporarily locked due to multiple failed login attempts. Please try again later'
      );
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await user.incLoginAttempts(env.MAX_LOGIN_ATTEMPTS, env.LOCKOUT_TIME_MS);
      throw invalidCredentialsError;
    }

    // Check active status
    if (!user.isActive) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Account has been deactivated');
    }

    // Reset failed login attempts on successful authentication
    await user.resetLoginLock();

    // Enforce max 10 active sessions: revoke oldest if limit reached
    const activeSessions = await RefreshToken.find({
      userId: user._id,
      userType: USER_TYPES.ADMIN,
      revokedAt: null,
    }).sort({ createdAt: 1 });

    if (activeSessions.length >= 10) {
      const excessCount = activeSessions.length - 9;
      for (let i = 0; i < excessCount; i++) {
        activeSessions[i].revokedAt = new Date();
        activeSessions[i].revokedReason = 'MAX_SESSIONS_EXCEEDED';
        await activeSessions[i].save();
      }
    }

    // Generate new token family
    const family = generateTokenFamily();
    const refreshTokenRaw = generateRandomToken(40);
    const tokenHash = hashToken(refreshTokenRaw);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await RefreshToken.create({
      userId: user._id,
      userType: USER_TYPES.ADMIN,
      userModel: 'AdminUser',
      tokenHash,
      family,
      expiresAt,
      ip: ip || null,
      userAgent: userAgent || null,
    });

    const accessToken = jwt.sign({ sub: user._id.toString() }, env.JWT_ACCESS_SECRET, {
      audience: TOKEN_AUDIENCE.ADMIN,
      expiresIn: env.JWT_ACCESS_EXPIRY,
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    };
  }

  /**
   * Admin Logout
   */
  static async logoutAdmin({ refreshTokenRaw }) {
    if (refreshTokenRaw) {
      const tokenHash = hashToken(refreshTokenRaw);
      await RefreshToken.updateOne(
        { tokenHash, userType: USER_TYPES.ADMIN, revokedAt: null },
        {
          $set: {
            revokedAt: new Date(),
            revokedReason: 'LOGOUT',
          },
        }
      );
    }
    return true;
  }

  /**
   * Admin Refresh Token Rotation with Grace Window and Reuse Detection
   */
  static async refreshAdminToken({ refreshTokenRaw, ip, userAgent }) {
    if (!refreshTokenRaw) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Refresh token required');
    }

    const tokenHash = hashToken(refreshTokenRaw);
    const tokenDoc = await RefreshToken.findOne({
      tokenHash,
      userType: USER_TYPES.ADMIN,
    });

    if (!tokenDoc) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Invalid refresh token');
    }

    // Reuse detection logic
    if (tokenDoc.revokedAt) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Refresh token has been revoked');
    }

    if (tokenDoc.replacedByTokenHash) {
      // Check ~10s grace window for parallel requests
      const isWithinGraceWindow =
        tokenDoc.replacedAt && Date.now() - new Date(tokenDoc.replacedAt).getTime() <= 10000;

      if (isWithinGraceWindow) {
        // Parallel refresh: allow issuing current active session access token
        const user = await AdminUser.findById(tokenDoc.userId);
        if (!user || !user.isActive) {
          throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Account deactivated or does not exist');
        }

        const accessToken = jwt.sign({ sub: user._id.toString() }, env.JWT_ACCESS_SECRET, {
          audience: TOKEN_AUDIENCE.ADMIN,
          expiresIn: env.JWT_ACCESS_EXPIRY,
        });

        return {
          accessToken,
          refreshToken: null, // Client keeps current replacement token
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            permissions: user.permissions,
          },
        };
      }

      // Reused outside grace window: Token theft alert! Revoke entire family
      await RefreshToken.updateMany(
        { family: tokenDoc.family },
        {
          $set: {
            revokedAt: new Date(),
            revokedReason: 'REUSE_DETECTED',
          },
        }
      );

      throw new AppError(
        401,
        ERROR_CODES.UNAUTHORIZED,
        'Security alert: Token reuse detected. All sessions revoked. Please log in again'
      );
    }

    // Check expiration
    if (tokenDoc.expiresAt < new Date()) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Refresh token expired');
    }

    const user = await AdminUser.findById(tokenDoc.userId);
    if (!user || !user.isActive) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Account deactivated or does not exist');
    }

    // Rotate refresh token
    const newRefreshTokenRaw = generateRandomToken(40);
    const newTokenHash = hashToken(newRefreshTokenRaw);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    tokenDoc.replacedByTokenHash = newTokenHash;
    tokenDoc.replacedAt = new Date();
    await tokenDoc.save();

    await RefreshToken.create({
      userId: user._id,
      userType: USER_TYPES.ADMIN,
      userModel: 'AdminUser',
      tokenHash: newTokenHash,
      family: tokenDoc.family,
      expiresAt,
      ip: ip || null,
      userAgent: userAgent || null,
    });

    const newAccessToken = jwt.sign({ sub: user._id.toString() }, env.JWT_ACCESS_SECRET, {
      audience: TOKEN_AUDIENCE.ADMIN,
      expiresIn: env.JWT_ACCESS_EXPIRY,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenRaw,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    };
  }
}

module.exports = AuthService;

