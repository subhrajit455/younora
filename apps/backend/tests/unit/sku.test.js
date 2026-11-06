const { generateSku, sanitizeToken } = require('../../src/core/utils/sku');

describe('Unit: SKU Generator Utility', () => {
  it('generates a standard uppercase SKU matching YNR-<CAT>-<PROD>-<COLOR>-<SIZE>', () => {
    const sku = generateSku({
      category: 'SHIRTS',
      product: 'ROYAL_SILK',
      color: 'NAVY',
      size: 'XL',
    });

    expect(sku).toBe('YNR-SHIRTS-ROYALSIL-NAVY-XL');
  });

  it('handles lowercase, accented and special characters cleanly', () => {
    const sku = generateSku({
      category: 'T-Shirts & Tops',
      product: 'Crème Kurta',
      color: 'Emerald Green',
      size: '38',
    });

    expect(sku).toBe('YNR-TSHIRT-CREMEKUR-EMERAL-38');
  });

  it('provides safe fallbacks for missing or non-string components', () => {
    const sku = generateSku({
      category: null,
      product: undefined,
      color: '',
      size: 123,
    });

    expect(sku).toBe('YNR-GEN-GEN-GEN-GEN');
  });

  it('sanitizes token up to maximum specified length', () => {
    expect(sanitizeToken('EXTREMELYLONGTOKEN', 5)).toBe('EXTRE');
    expect(sanitizeToken('A-B_C#D!1@2', 6)).toBe('ABCD12');
  });
});

