const { env } = require('../../config/env');

const COOKIE_NAMES = Object.freeze({
  ADMIN: 'ynr_admin_rt',
  CUSTOMER: 'ynr_cust_rt',
});

const COOKIE_PATHS = Object.freeze({
  ADMIN: `${env.API_PREFIX}/auth/admin`,
  CUSTOMER: `${env.API_PREFIX}/auth/customer`,
});

const DEFAULT_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === 'production' || env.NODE_ENV === 'staging',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
});

/**
 * Sets refresh token in a hardened httpOnly cookie
 * @param {object} res Express response object
 * @param {string} token Raw refresh token string
 * @param {'ADMIN'|'CUSTOMER'} type
 */
function setRefreshTokenCookie(res, token, type = 'ADMIN') {
  const isCust = type === 'CUSTOMER';
  const name = isCust ? COOKIE_NAMES.CUSTOMER : COOKIE_NAMES.ADMIN;
  const path = isCust ? COOKIE_PATHS.CUSTOMER : COOKIE_PATHS.ADMIN;

  res.cookie(name, token, {
    ...DEFAULT_COOKIE_OPTIONS,
    path,
  });
}

/**
 * Clears the refresh token cookie
 * @param {object} res Express response object
 * @param {'ADMIN'|'CUSTOMER'} type
 */
function clearRefreshTokenCookie(res, type = 'ADMIN') {
  const isCust = type === 'CUSTOMER';
  const name = isCust ? COOKIE_NAMES.CUSTOMER : COOKIE_NAMES.ADMIN;
  const path = isCust ? COOKIE_PATHS.CUSTOMER : COOKIE_PATHS.ADMIN;

  res.clearCookie(name, {
    ...DEFAULT_COOKIE_OPTIONS,
    path,
  });
}

module.exports = {
  COOKIE_NAMES,
  COOKIE_PATHS,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
};

