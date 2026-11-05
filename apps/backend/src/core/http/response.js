/**
 * Standard success response helper
 * Format: { success: true, message, data, meta? }
 */
function sendSuccess(res, { statusCode = 200, message = 'Success', data = {}, meta } = {}) {
  const payload = {
    success: true,
    message,
    data,
  };

  if (meta !== undefined) {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  sendSuccess,
};

