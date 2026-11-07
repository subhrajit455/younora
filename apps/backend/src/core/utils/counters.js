const Counter = require('../../modules/inventory/models/counter.model');
const { INVOICE_TYPE } = require('@younora/shared-constants');

/**
 * Calculates current Indian Financial Year string (e.g., "2627" for FY 2026-27).
 * Indian FY starts 1 April (month index 3) and ends 31 March.
 */
function getIndianFinancialYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr

  let startYear;
  if (month >= 3) {
    startYear = year;
  } else {
    startYear = year - 1;
  }

  const startYY = String(startYear).slice(-2);
  const endYY = String(startYear + 1).slice(-2);
  return `${startYY}${endYY}`;
}

/**
 * Generates an atomic, sequential order number (Rule 7 / §7.2: YNR-YYMM-00001)
 *
 * @param {import('mongoose').ClientSession} [session]
 * @returns {Promise<string>} e.g. "YNR-2611-00001"
 */
async function generateOrderNo(session = undefined) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yymm = `${yy}${mm}`;

  const key = `order-${yymm}`;
  const seq = await Counter.getNextSequence(key, session);
  return `YNR-${yymm}-${String(seq).padStart(5, '0')}`;
}

/**
 * Generates an atomic sequential tax invoice number (INV/2627/00001 or RINV/2627/00001)
 *
 * @param {string} type - 'INTERNAL' or 'RESELLING'
 * @param {string} [financialYear] - Optional explicit FY (e.g., "2627")
 * @param {import('mongoose').ClientSession} [session]
 * @returns {Promise<string>}
 */
async function generateInvoiceNo(type = INVOICE_TYPE.INTERNAL, financialYear = undefined, session = undefined) {
  const fy = financialYear || getIndianFinancialYear();
  const prefix = type === INVOICE_TYPE.RESELLING ? 'RINV' : 'INV';

  const key = `invoice-${prefix.toLowerCase()}-${fy}`;
  const seq = await Counter.getNextSequence(key, session);
  return `${prefix}/${fy}/${String(seq).padStart(5, '0')}`;
}

module.exports = {
  getIndianFinancialYear,
  generateOrderNo,
  generateInvoiceNo,
};

