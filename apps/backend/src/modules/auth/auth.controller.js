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
}

module.exports = AuthController;

