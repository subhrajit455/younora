const AuthService = require('./auth.service');
const { setRefreshTokenCookie, clearRefreshTokenCookie, COOKIE_NAMES } = require('../../core/utils/cookies');
const { sendSuccess } = require('../../core/http/response');

class AuthController {
  static async loginAdmin(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.loginAdmin({
        email,
        password,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      setRefreshTokenCookie(res, result.refreshToken, 'ADMIN');

      return sendSuccess(res, {
        message: 'Admin login successful',
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async logoutAdmin(req, res, next) {
    try {
      const refreshToken = req.cookies?.[COOKIE_NAMES.ADMIN];
      await AuthService.logoutAdmin({ refreshTokenRaw: refreshToken });

      clearRefreshTokenCookie(res, 'ADMIN');

      return sendSuccess(res, {
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async refreshAdmin(req, res, next) {
    try {
      const refreshToken = req.cookies?.[COOKIE_NAMES.ADMIN];
      const result = await AuthService.refreshAdminToken({
        refreshTokenRaw: refreshToken,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      if (result.refreshToken) {
        setRefreshTokenCookie(res, result.refreshToken, 'ADMIN');
      }

      return sendSuccess(res, {
        message: 'Token refreshed successfully',
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async registerCustomer(req, res, next) {
    try {
      const { name, email, phone, password } = req.body;
      const result = await AuthService.registerCustomer({
        name,
        email,
        phone,
        password,
      });

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Registration successful. Please check your email to verify your account',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async loginCustomer(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.loginCustomer({
        email,
        password,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      setRefreshTokenCookie(res, result.refreshToken, 'CUSTOMER');

      return sendSuccess(res, {
        message: 'Login successful',
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async logoutCustomer(req, res, next) {
    try {
      const refreshToken = req.cookies?.[COOKIE_NAMES.CUSTOMER];
      await AuthService.logoutCustomer({ refreshTokenRaw: refreshToken });

      clearRefreshTokenCookie(res, 'CUSTOMER');

      return sendSuccess(res, {
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async refreshCustomer(req, res, next) {
    try {
      const refreshToken = req.cookies?.[COOKIE_NAMES.CUSTOMER];
      const result = await AuthService.refreshCustomerToken({
        refreshTokenRaw: refreshToken,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      if (result.refreshToken) {
        setRefreshTokenCookie(res, result.refreshToken, 'CUSTOMER');
      }

      return sendSuccess(res, {
        message: 'Token refreshed successfully',
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      await AuthService.forgotPassword({ email });

      return sendSuccess(res, {
        message: 'If an account exists with that email, a password reset link has been sent',
      });
    } catch (error) {
      next(error);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const { token, password } = req.body;
      await AuthService.resetPassword({ token, password });

      return sendSuccess(res, {
        message: 'Password has been reset successfully. Please log in with your new password',
      });
    } catch (error) {
      next(error);
    }
  }

  static async verifyEmail(req, res, next) {
    try {
      const { token } = req.body;
      await AuthService.verifyEmail({ token });

      return sendSuccess(res, {
        message: 'Email verified successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async resendVerification(req, res, next) {
    try {
      const { email } = req.body;
      await AuthService.resendVerificationEmail({ email });

      return sendSuccess(res, {
        message: 'If the account exists and is unverified, a verification email has been sent',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;

