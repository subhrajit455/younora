/**
 * Utility functions for money calculations strictly in integer paise
 * Rule 7: Money = integer paise. Never use floats.
 */

/**
 * Convert rupee amount (e.g. 1999 or 1999.50) into integer paise safely
 * @param {number|string} rupees
 * @returns {number} integer paise
 */
function rupeesToPaise(rupees) {
  const num = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(num)) {
    throw new TypeError('Invalid rupee value provided for conversion');
  }
  return Math.round(num * 100);
}

/**
 * Convert integer paise to rupee floating representation (for edge display only)
 * @param {number} paise
 * @returns {number} rupees
 */
function paiseToRupees(paise) {
  if (!Number.isInteger(paise)) {
    throw new TypeError('Paise amount must be an integer');
  }
  return paise / 100;
}

/**
 * Format integer paise into INR currency display string (e.g., ₹1,999.00)
 * @param {number} paise
 * @returns {string} formatted string
 */
function formatRupees(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(paiseToRupees(paise));
}

module.exports = {
  rupeesToPaise,
  paiseToRupees,
  formatRupees,
};

