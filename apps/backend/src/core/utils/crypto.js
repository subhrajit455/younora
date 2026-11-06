const crypto = require('crypto');

/**
 * Hash raw token string using SHA-256 for secure DB persistence
 * @param {string} token
 * @returns {string} hex digest
 */
function hashToken(token) {
  if (!token || typeof token !== 'string') {
    throw new TypeError('Token must be a non-empty string');
  }
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate cryptographically secure random token string
 * @param {number} bytes
 * @returns {string} hex string
 */
function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a UUID v4 string for token family tracking
 * @returns {string}
 */
function generateTokenFamily() {
  return crypto.randomUUID();
}

module.exports = {
  hashToken,
  generateRandomToken,
  generateTokenFamily,
};

