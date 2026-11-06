/**
 * SKU Generator Utility
 * Generates standardized SKUs following the convention:
 * YNR-<CAT>-<PROD>-<COLOR>-<SIZE>
 */

function sanitizeToken(str, maxLen = 8) {
  if (!str || typeof str !== 'string') return 'GEN';
  const cleaned = str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, maxLen) || 'GEN';
}

function generateSku({ category, product, color, size }) {
  const catToken = sanitizeToken(category, 6);
  const prodToken = sanitizeToken(product, 8);
  const colorToken = sanitizeToken(color, 6);
  const sizeToken = sanitizeToken(size, 4);

  return `YNR-${catToken}-${prodToken}-${colorToken}-${sizeToken}`;
}

module.exports = {
  generateSku,
  sanitizeToken,
};

