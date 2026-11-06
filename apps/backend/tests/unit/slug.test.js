const { generateSlug } = require('../../src/core/utils/slug');

describe('Unit: Slug Generator Utility', () => {
  it('converts simple text to kebab-case slug', () => {
    expect(generateSlug('Men Ethnic Wear')).toBe('men-ethnic-wear');
  });

  it('lowercases all characters', () => {
    expect(generateSlug('LUXURY SILK SAREES')).toBe('luxury-silk-sarees');
  });

  it('normalizes accented and diacritic characters', () => {
    expect(generateSlug('Crème Brûlée Collection')).toBe('creme-brulee-collection');
  });

  it('removes special characters and punctuation', () => {
    expect(generateSlug('Men’s Kurta & Pyjama (Set #1)!')).toBe('mens-kurta-pyjama-set-1');
  });

  it('collapses multiple spaces, underscores, and hyphens', () => {
    expect(generateSlug('  Silk___Blend---Shirt   Collection  ')).toBe('silk-blend-shirt-collection');
  });

  it('returns empty string for invalid or empty inputs', () => {
    expect(generateSlug('')).toBe('');
    expect(generateSlug(null)).toBe('');
    expect(generateSlug(undefined)).toBe('');
    expect(generateSlug(12345)).toBe('');
  });
});

