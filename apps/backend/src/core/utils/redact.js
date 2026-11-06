/**
 * Deep redaction utility to sanitize sensitive fields from objects before logging / auditing.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'refreshtoken',
  'emailverificationtokenhash',
  'passwordresettokenhash',
  'payoutdetails',
  'secret',
  'currentpassword',
  'newpassword',
  'authorization',
  'cvv',
]);

function redactSensitiveData(data, depth = 0) {
  if (depth > 10 || data === null || data === undefined) {
    return data;
  }

  // Handle Mongoose documents
  if (typeof data.toObject === 'function') {
    data = data.toObject();
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item, depth + 1));
  }

  // Handle Objects
  if (typeof data === 'object' && !(data instanceof Date) && !(data instanceof RegExp)) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      const normalizedKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(normalizedKey)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = redactSensitiveData(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return data;
}

module.exports = {
  redactSensitiveData,
  SENSITIVE_KEYS,
};

