const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { env } = require('../../config/env');
const { USER_TYPES, TOKEN_AUDIENCE } = require('@younora/shared-constants');
const AdminUser = require('../users/models/adminUser.model');
const Customer = require('../users/models/customer.model');
const RefreshToken = require('../users/models/refreshToken.model');
const AuditService = require('../audit/audit.service');
const { hashToken, generateRandomToken, generateTokenFamily } = require('../../core/utils/crypto');
const mailer = require('../../core/mail/mailer');
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

    // Record audit log for admin login
    await AuditService.record({
      actor: user,
      action: 'auth.admin.login',
      entity: 'AdminUser',
      entityId: user._id,
      before: null,
      after: {
        lastLoginAt: user.lastLoginAt,
      },
      ip,
      userAgent,
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

  /**
   * Customer Registration
   */
  static async registerCustomer({ name, email, phone, password }) {
    const normalizedEmail = email.toLowerCase().trim();

    const existingEmail = await Customer.findOne({ email: normalizedEmail });
    if (existingEmail) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        'An account with this email address already exists'
      );
    }

    if (phone) {
      const existingPhone = await Customer.findOne({ phone: phone.trim() });
      if (existingPhone) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          'An account with this phone number already exists'
        );
      }
    }

    const saltRounds = Math.max(env.BCRYPT_SALT_ROUNDS, 12);
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const verificationTokenRaw = generateRandomToken(32);
    const verificationTokenHash = hashToken(verificationTokenRaw);
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const customer = await Customer.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone ? phone.trim() : undefined,
      passwordHash,
      emailVerificationTokenHash: verificationTokenHash,
      emailVerificationExpiresAt: verificationExpiresAt,
      emailVerified: false,
    });

    // Send verification email
    await mailer.sendVerificationEmail({
      to: customer.email,
      name: customer.name,
      token: verificationTokenRaw,
    });

    return {
      id: customer._id,
      name: customer.name,
      email: customer.email,
      emailVerified: customer.emailVerified,
    };
  }

  /**
   * Customer Login
   */
  static async loginCustomer({ email, password, ip, userAgent }) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await Customer.findOne({ email: normalizedEmail }).select('+passwordHash');

    const invalidCredentialsError = new AppError(
      401,
      ERROR_CODES.UNAUTHORIZED,
      'Invalid email or password'
    );

    if (!user) {
      throw invalidCredentialsError;
    }

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

    if (user.isBlocked) {
      throw new AppError(
        401,
        ERROR_CODES.UNAUTHORIZED,
        `Account blocked: ${user.blockReason || 'Terms violation'}`
      );
    }

    await user.resetLoginLock();

    // Enforce max 10 active sessions
    const activeSessions = await RefreshToken.find({
      userId: user._id,
      userType: USER_TYPES.CUSTOMER,
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

    const family = generateTokenFamily();
    const refreshTokenRaw = generateRandomToken(40);
    const tokenHash = hashToken(refreshTokenRaw);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
      userId: user._id,
      userType: USER_TYPES.CUSTOMER,
      userModel: 'Customer',
      tokenHash,
      family,
      expiresAt,
      ip: ip || null,
      userAgent: userAgent || null,
    });

    const accessToken = jwt.sign({ sub: user._id.toString() }, env.JWT_ACCESS_SECRET, {
      audience: TOKEN_AUDIENCE.CUSTOMER,
      expiresIn: env.JWT_ACCESS_EXPIRY,
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isReseller: user.isReseller,
        emailVerified: user.emailVerified,
      },
    };
  }

  /**
   * Customer Logout
   */
  static async logoutCustomer({ refreshTokenRaw }) {
    if (refreshTokenRaw) {
      const tokenHash = hashToken(refreshTokenRaw);
      await RefreshToken.updateOne(
        { tokenHash, userType: USER_TYPES.CUSTOMER, revokedAt: null },
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
   * Customer Refresh Token Rotation with Grace Window
   */
  static async refreshCustomerToken({ refreshTokenRaw, ip, userAgent }) {
    if (!refreshTokenRaw) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Refresh token required');
    }

    const tokenHash = hashToken(refreshTokenRaw);
    const tokenDoc = await RefreshToken.findOne({
      tokenHash,
      userType: USER_TYPES.CUSTOMER,
    });

    if (!tokenDoc) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Invalid refresh token');
    }

    if (tokenDoc.revokedAt) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Refresh token has been revoked');
    }

    if (tokenDoc.replacedByTokenHash) {
      const isWithinGraceWindow =
        tokenDoc.replacedAt && Date.now() - new Date(tokenDoc.replacedAt).getTime() <= 10000;

      if (isWithinGraceWindow) {
        const user = await Customer.findById(tokenDoc.userId);
        if (!user || user.isBlocked) {
          throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Account blocked or does not exist');
        }

        const accessToken = jwt.sign({ sub: user._id.toString() }, env.JWT_ACCESS_SECRET, {
          audience: TOKEN_AUDIENCE.CUSTOMER,
          expiresIn: env.JWT_ACCESS_EXPIRY,
        });

        return {
          accessToken,
          refreshToken: null,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            isReseller: user.isReseller,
            emailVerified: user.emailVerified,
          },
        };
      }

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

    if (tokenDoc.expiresAt < new Date()) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Refresh token expired');
    }

    const user = await Customer.findById(tokenDoc.userId);
    if (!user || user.isBlocked) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Account blocked or does not exist');
    }

    const newRefreshTokenRaw = generateRandomToken(40);
    const newTokenHash = hashToken(newRefreshTokenRaw);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    tokenDoc.replacedByTokenHash = newTokenHash;
    tokenDoc.replacedAt = new Date();
    await tokenDoc.save();

    await RefreshToken.create({
      userId: user._id,
      userType: USER_TYPES.CUSTOMER,
      userModel: 'Customer',
      tokenHash: newTokenHash,
      family: tokenDoc.family,
      expiresAt,
      ip: ip || null,
      userAgent: userAgent || null,
    });

    const newAccessToken = jwt.sign({ sub: user._id.toString() }, env.JWT_ACCESS_SECRET, {
      audience: TOKEN_AUDIENCE.CUSTOMER,
      expiresIn: env.JWT_ACCESS_EXPIRY,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenRaw,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isReseller: user.isReseller,
        emailVerified: user.emailVerified,
      },
    };
  }

  /**
   * Forgot Password — Rule 9: always returns true / 200 (prevents email enumeration)
   */
  static async forgotPassword({ email }) {
    const normalizedEmail = email.toLowerCase().trim();
    const customer = await Customer.findOne({ email: normalizedEmail });

    if (customer) {
      const resetTokenRaw = generateRandomToken(32);
      customer.passwordResetTokenHash = hashToken(resetTokenRaw);
      customer.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await customer.save();

      await mailer.sendPasswordResetEmail({
        to: customer.email,
        name: customer.name,
        token: resetTokenRaw,
      });
    }

    return true;
  }

  /**
   * Reset Password
   */
  static async resetPassword({ token, password }) {
    const tokenHash = hashToken(token);
    const customer = await Customer.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!customer) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        'Password reset link is invalid or has expired'
      );
    }

    const saltRounds = Math.max(env.BCRYPT_SALT_ROUNDS, 12);
    customer.passwordHash = await bcrypt.hash(password, saltRounds);
    customer.passwordChangedAt = new Date();
    customer.passwordResetTokenHash = undefined;
    customer.passwordResetExpiresAt = undefined;
    await customer.save();

    // Revoke all active sessions on password change
    await RefreshToken.updateMany(
      { userId: customer._id, userType: USER_TYPES.CUSTOMER, revokedAt: null },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: 'PASSWORD_RESET',
        },
      }
    );

    return true;
  }

  /**
   * Verify Email
   */
  static async verifyEmail({ token }) {
    const tokenHash = hashToken(token);
    const customer = await Customer.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: { $gt: new Date() },
    });

    if (!customer) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        'Email verification link is invalid or has expired'
      );
    }

    customer.emailVerified = true;
    customer.emailVerificationTokenHash = undefined;
    customer.emailVerificationExpiresAt = undefined;
    await customer.save();

    return true;
  }

  /**
   * Resend Verification Email
   */
  static async resendVerificationEmail({ email }) {
    const normalizedEmail = email.toLowerCase().trim();
    const customer = await Customer.findOne({ email: normalizedEmail });

    if (customer && !customer.emailVerified) {
      const verificationTokenRaw = generateRandomToken(32);
      customer.emailVerificationTokenHash = hashToken(verificationTokenRaw);
      customer.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await customer.save();

      await mailer.sendVerificationEmail({
        to: customer.email,
        name: customer.name,
        token: verificationTokenRaw,
      });
    }

    return true;
  }
}

module.exports = AuthService;

