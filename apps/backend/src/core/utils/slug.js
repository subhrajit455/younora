/**
 * Slug generator utility
 * Converts strings to URL-friendly lowercase kebab-case slugs.
 */

function generateSlug(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .toLowerCase()
    .trim()
    .normalize('NFD') // Separate accented characters into base and accent
    .replace(/[\u0300-\u036f]/g, '') // Strip accents
    .replace(/[^a-z0-9\s-_]/g, '') // Remove non-alphanumeric chars except whitespace, hyphen, underscore
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Trim leading and trailing hyphens
}

module.exports = {
  generateSlug,
};

