const Counter = require('../models/counter.model');

const AUDIENCE_CODE_MAP = {
  men: 'MEN',
  women: 'WMN',
  kids: 'KID',
};

/**
 * Resolves a 3-letter uppercase audience code from audience name or slug.
 * @param {string} audienceNameOrSlug
 * @returns {string}
 */
function resolveAudienceCode(audienceNameOrSlug) {
  if (!audienceNameOrSlug || typeof audienceNameOrSlug !== 'string') {
    return 'GEN';
  }
  const normalized = audienceNameOrSlug.trim().toLowerCase();
  if (AUDIENCE_CODE_MAP[normalized]) {
    return AUDIENCE_CODE_MAP[normalized];
  }
  const cleaned = normalized.replace(/[^a-z0-9]/g, '').toUpperCase();
  return (cleaned.slice(0, 3) || 'GEN').padEnd(3, 'X');
}

/**
 * Formats a Date into YYMM string (e.g., Nov 2026 -> "2611").
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function formatYYMM(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

/**
 * Atomically generates a unique batch number in the format YNR-<YYMM>-<AUD>-<SEQ4>
 * using the `counters` collection.
 *
 * @param {Object} options
 * @param {string} [options.audience] - Audience name or slug (e.g. "Women", "Men", "Kids")
 * @param {Date} [options.date] - Reference date for YYMM (defaults to now)
 * @param {import('mongoose').ClientSession} [options.session] - Optional Mongo session
 * @returns {Promise<string>} e.g. "YNR-2611-WMN-0001"
 */
async function generateBatchNumber({ audience = 'GEN', date = new Date(), session } = {}) {
  const yymm = formatYYMM(date);
  const audCode = resolveAudienceCode(audience);
  const counterKey = `batch-${yymm}`;

  const seq = await Counter.getNextSequence(counterKey, session);
  const seqStr = String(seq).padStart(4, '0');

  return `YNR-${yymm}-${audCode}-${seqStr}`;
}

module.exports = {
  resolveAudienceCode,
  formatYYMM,
  generateBatchNumber,
};

