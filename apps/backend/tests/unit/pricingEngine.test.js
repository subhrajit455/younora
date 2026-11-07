const { calculatePriceBreakup } = require('../../src/modules/pricing/pricing.engine');
const { COUPON_TYPE, COUPON_SCOPE, PAYMENT_METHOD } = require('@younora/shared-constants');

describe('Slice 2: Core Pricing Engine (Phase B7 Gate: ≥ 25 Golden Test Cases)', () => {
  const defaultSettings = {
    store: {
      name: 'Younora',
      stateCode: '07', // Delhi
    },
    payments: {
      onlineEnabled: true,
      codEnabled: true,
      codMinOrder: 100000, // ₹1,000
      codMaxOrder: 5000000, // ₹50,000
      codFee: 15000, // ₹150
      codBlockedPincodes: ['110099', '400099'],
    },
    shipping: {
      freeShippingAbove: 500000, // ₹5,000
      flatFee: 25000, // ₹250
    },
    tax: {
      pricesInclusiveOfTax: true,
    },
    reselling: {
      enabled: true,
      defaultMaxMarginPercent: 40,
      priceMayExceedMrp: false,
      couponsAllowedOnResellerOrders: false,
    },
  };

  const sampleSherwani = {
    variantId: 'var-1',
    productId: 'prod-1',
    categoryId: 'cat-ethnic',
    name: 'Raw Silk Sherwani',
    sku: 'YNR-SHERWANI-01',
    mrp: 5000000, // ₹50,000
    baseSellingPrice: 4000000, // ₹40,000
    qty: 1,
    gstPercent: 12,
    resellingEnabled: true,
  };

  const sampleSaree = {
    variantId: 'var-2',
    productId: 'prod-2',
    categoryId: 'cat-sarees',
    name: 'Mulberry Silk Saree',
    sku: 'YNR-SAREE-01',
    mrp: 2500000, // ₹25,000
    baseSellingPrice: 2000000, // ₹20,000
    qty: 1,
    gstPercent: 5,
    resellingEnabled: true,
  };

  // Case 1
  it('1. calculates basic single item totals with free shipping when above threshold', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani],
      deliveryAddress: { stateCode: '07', pincode: '110001' },
      settings: defaultSettings,
    });

    expect(res.itemsTotal).toBe(4000000);
    expect(res.discount).toBe(0);
    expect(res.shippingFee).toBe(0); // ₹40,000 > ₹5,000
    expect(res.codFee).toBe(0);
    expect(res.grandTotal).toBe(4000000);
  });

  // Case 2
  it('2. calculates multi-item and multi-quantity totals accurately', () => {
    const res = calculatePriceBreakup({
      items: [
        { ...sampleSherwani, qty: 2 }, // 2 * 40,000 = 80,000
        { ...sampleSaree, qty: 3 }, // 3 * 20,000 = 60,000
      ],
      settings: defaultSettings,
    });

    expect(res.itemsTotal).toBe(14000000); // ₹140,000
    expect(res.grandTotal).toBe(14000000);
  });

  // Case 3
  it('3. calculates tax-inclusive breakdown (taxable value + GST equals item total)', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani], // 40,000 inclusive of 12% GST
      settings: { ...defaultSettings, tax: { pricesInclusiveOfTax: true } },
    });

    // 40,000 / 1.12 = 35714.2857 -> 3571429 paise taxable, 428571 paise GST
    expect(res.taxableAmount + res.gstTotal.total).toBe(res.itemsTotal);
    expect(res.taxableAmount).toBe(3571429);
    expect(res.gstTotal.total).toBe(428571);
  });

  // Case 4
  it('4. calculates tax-exclusive breakdown (tax added on top of item price)', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani],
      settings: { ...defaultSettings, tax: { pricesInclusiveOfTax: false } },
    });

    // 40,000 taxable + 12% GST (4,800) = 44,800
    expect(res.taxableAmount).toBe(4000000);
    expect(res.gstTotal.total).toBe(480000);
    expect(res.grandTotal).toBe(4480000);
  });

  // Case 5
  it('5. intra-state delivery (Delhi to Delhi) splits GST equally into CGST and SGST', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani],
      deliveryAddress: { stateCode: '07' }, // Store is 07
      settings: defaultSettings,
    });

    expect(res.gstTotal.isIntraState).toBe(true);
    expect(res.gstTotal.igst).toBe(0);
    expect(res.gstTotal.cgst).toBeGreaterThan(0);
    expect(res.gstTotal.sgst).toBeGreaterThan(0);
    expect(res.gstTotal.cgst + res.gstTotal.sgst).toBe(res.gstTotal.total);
  });

  // Case 6
  it('6. inter-state delivery (Delhi to Maharashtra) charges entire GST as IGST', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani],
      deliveryAddress: { stateCode: '27' }, // Maharashtra
      settings: defaultSettings,
    });

    expect(res.gstTotal.isIntraState).toBe(false);
    expect(res.gstTotal.cgst).toBe(0);
    expect(res.gstTotal.sgst).toBe(0);
    expect(res.gstTotal.igst).toBe(res.gstTotal.total);
  });

  // Case 7
  it('7. odd-paise GST division preserves exact sum between CGST and SGST', () => {
    // 1 item with odd GST calculation
    const itemWithOddPrice = {
      ...sampleSherwani,
      baseSellingPrice: 111111,
      gstPercent: 12,
    };
    const res = calculatePriceBreakup({
      items: [itemWithOddPrice],
      deliveryAddress: { stateCode: '07' },
      settings: defaultSettings,
    });

    expect(res.gstTotal.cgst + res.gstTotal.sgst).toBe(res.gstTotal.total);
  });

  // Case 8
  it('8. applies flat coupon discount correctly', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani],
      coupon: {
        code: 'FLAT500',
        type: COUPON_TYPE.FLAT,
        value: 50000, // ₹500
        scope: COUPON_SCOPE.ALL,
      },
      settings: defaultSettings,
    });

    expect(res.discount).toBe(50000);
    expect(res.couponCode).toBe('FLAT500');
    expect(res.grandTotal).toBe(3950000); // 40,000 - 500
  });

  // Case 9
  it('9. flat coupon exceeding cart total is clamped to cart total (never negative)', () => {
    const res = calculatePriceBreakup({
      items: [{ ...sampleSherwani, baseSellingPrice: 30000 }], // ₹300
      coupon: {
        code: 'BIGFLAT',
        type: COUPON_TYPE.FLAT,
        value: 100000, // ₹1,000
        scope: COUPON_SCOPE.ALL,
      },
      settings: { ...defaultSettings, shipping: { freeShippingAbove: 0, flatFee: 0 } },
    });

    expect(res.discount).toBe(30000);
    expect(res.grandTotal).toBe(0);
  });

  // Case 10
  it('10. applies percentage coupon accurately', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani], // ₹40,000
      coupon: {
        code: 'ROYAL10',
        type: COUPON_TYPE.PERCENT,
        value: 10, // 10%
        scope: COUPON_SCOPE.ALL,
      },
      settings: defaultSettings,
    });

    expect(res.discount).toBe(400000); // 10% of 40,000 = 4,000
    expect(res.grandTotal).toBe(3600000);
  });

  // Case 11
  it('11. percentage coupon obeys maxDiscount cap', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani], // ₹40,000
      coupon: {
        code: 'MEGA25',
        type: COUPON_TYPE.PERCENT,
        value: 25, // 25% of 40,000 = 10,000
        maxDiscount: 200000, // Capped at ₹2,000
        scope: COUPON_SCOPE.ALL,
      },
      settings: defaultSettings,
    });

    expect(res.discount).toBe(200000); // Capped at 2,000
    expect(res.grandTotal).toBe(3800000);
  });

  // Case 12
  it('12. coupon rejected with warning when cart total is below minCartValue', () => {
    const res = calculatePriceBreakup({
      items: [{ ...sampleSherwani, baseSellingPrice: 200000 }], // ₹2,000
      coupon: {
        code: 'LUXURY50',
        type: COUPON_TYPE.FLAT,
        value: 50000,
        minCartValue: 500000, // ₹5,000 required
        scope: COUPON_SCOPE.ALL,
      },
      settings: defaultSettings,
    });

    expect(res.discount).toBe(0);
    expect(res.couponCode).toBeNull();
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('Minimum cart value');
  });

  // Case 13
  it('13. category-scoped coupon discounts ONLY matching category items', () => {
    const res = calculatePriceBreakup({
      items: [
        sampleSherwani, // category: cat-ethnic (₹40,000)
        sampleSaree, // category: cat-sarees (₹20,000)
      ],
      coupon: {
        code: 'SAREE20',
        type: COUPON_TYPE.PERCENT,
        value: 20, // 20% on Saree only (20% of 20,000 = 4,000)
        scope: COUPON_SCOPE.CATEGORY,
        scopeIds: ['cat-sarees'],
      },
      settings: defaultSettings,
    });

    expect(res.discount).toBe(400000);
    expect(res.items.find((i) => i.categoryId === 'cat-sarees').itemDiscount).toBe(400000);
    expect(res.items.find((i) => i.categoryId === 'cat-ethnic').itemDiscount).toBe(0);
  });

  // Case 14
  it('14. product-scoped coupon discounts ONLY matching product items', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani, sampleSaree],
      coupon: {
        code: 'SHERWANI1000',
        type: COUPON_TYPE.FLAT,
        value: 100000, // ₹1,000
        scope: COUPON_SCOPE.PRODUCT,
        scopeIds: ['prod-1'],
      },
      settings: defaultSettings,
    });

    expect(res.discount).toBe(100000);
    expect(res.items.find((i) => i.productId === 'prod-1').itemDiscount).toBe(100000);
    expect(res.items.find((i) => i.productId === 'prod-2').itemDiscount).toBe(0);
  });

  // Case 15
  it('15. pro-rated coupon discount sum across multiple lines strictly equals total discount', () => {
    const res = calculatePriceBreakup({
      items: [
        { ...sampleSherwani, baseSellingPrice: 333333 },
        { ...sampleSaree, baseSellingPrice: 666667 },
      ],
      coupon: {
        code: 'SPLIT1000',
        type: COUPON_TYPE.FLAT,
        value: 100000,
        scope: COUPON_SCOPE.ALL,
      },
      settings: defaultSettings,
    });

    const sumLineDiscounts = res.items.reduce((acc, it) => acc + it.itemDiscount, 0);
    expect(sumLineDiscounts).toBe(res.discount);
    expect(res.discount).toBe(100000);
  });

  // Case 16
  it('16. orders at or above threshold get free shipping (shippingFee = 0)', () => {
    const res = calculatePriceBreakup({
      items: [{ ...sampleSherwani, baseSellingPrice: 500000 }], // Exactly ₹5,000 threshold
      settings: defaultSettings,
    });

    expect(res.shippingFee).toBe(0);
  });

  // Case 17
  it('17. orders below threshold are charged configured flat shipping fee', () => {
    const res = calculatePriceBreakup({
      items: [{ ...sampleSherwani, baseSellingPrice: 400000 }], // ₹4,000 < ₹5,000
      settings: defaultSettings,
    });

    expect(res.shippingFee).toBe(25000); // ₹250 flat fee
    expect(res.grandTotal).toBe(425000); // 4,000 + 250
  });

  // Case 18
  it('18. free shipping threshold evaluates net goods AFTER coupon discount', () => {
    // ₹5,200 total - ₹500 coupon = ₹4,700 net (< ₹5,000 threshold -> pays flat shipping)
    const res = calculatePriceBreakup({
      items: [{ ...sampleSherwani, baseSellingPrice: 520000 }],
      coupon: {
        code: 'FLAT500',
        type: COUPON_TYPE.FLAT,
        value: 50000,
        scope: COUPON_SCOPE.ALL,
      },
      settings: defaultSettings,
    });

    expect(res.discount).toBe(50000);
    expect(res.shippingFee).toBe(25000);
    expect(res.grandTotal).toBe(520000 - 50000 + 25000);
  });

  // Case 19
  it('19. adds COD fee when payment method is COD and order is within range', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani], // ₹40,000 (within 1,000 - 50,000 COD range)
      paymentMethod: PAYMENT_METHOD.COD,
      settings: defaultSettings,
    });

    expect(res.codFee).toBe(15000); // ₹150
    expect(res.grandTotal).toBe(4000000 + 15000);
  });

  // Case 20
  it('20. throws error if COD is disabled in settings', () => {
    expect(() =>
      calculatePriceBreakup({
        items: [sampleSherwani],
        paymentMethod: PAYMENT_METHOD.COD,
        settings: {
          ...defaultSettings,
          payments: { ...defaultSettings.payments, codEnabled: false },
        },
      })
    ).toThrow(/COD.*disabled/i);
  });

  // Case 21
  it('21. throws error if COD order is below codMinOrder', () => {
    expect(() =>
      calculatePriceBreakup({
        items: [{ ...sampleSherwani, baseSellingPrice: 50000 }], // ₹500 < ₹1,000 min
        paymentMethod: PAYMENT_METHOD.COD,
        settings: defaultSettings,
      })
    ).toThrow(/Minimum order value for COD/i);
  });

  // Case 22
  it('22. throws error if COD order is above codMaxOrder', () => {
    expect(() =>
      calculatePriceBreakup({
        items: [{ ...sampleSherwani, baseSellingPrice: 6000000 }], // ₹60,000 > ₹50,000 max
        paymentMethod: PAYMENT_METHOD.COD,
        settings: defaultSettings,
      })
    ).toThrow(/Maximum order value for COD/i);
  });

  // Case 23
  it('23. throws error if delivery pincode is in codBlockedPincodes', () => {
    expect(() =>
      calculatePriceBreakup({
        items: [sampleSherwani],
        deliveryAddress: { pincode: '110099' }, // In blocked list
        paymentMethod: PAYMENT_METHOD.COD,
        settings: defaultSettings,
      })
    ).toThrow(/not available for delivery pincode/i);
  });

  // Case 24
  it('24. valid reseller share token adds marginPerUnit and computes reseller earnings', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani], // Base ₹40,000, MRP ₹50,000
      resellerShare: {
        resellerId: 'reseller-123',
        token: 'SHARE-TOKEN-99',
        marginPerUnit: 500000, // ₹5,000 margin
        isActive: true,
        resellerStatus: 'APPROVED',
      },
      settings: defaultSettings,
    });

    expect(res.reselling.isResellerOrder).toBe(true);
    expect(res.reselling.marginTotal).toBe(500000);
    expect(res.reselling.baseAmount).toBe(4000000);
    expect(res.reselling.buyerAmount).toBe(4500000); // 40,000 base + 5,000 margin
    expect(res.itemsTotal).toBe(4500000);
  });

  // Case 25
  it('25. reseller margin is clamped by defaultMaxMarginPercent limit', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani], // Base ₹40,000, 40% default max = ₹16,000
      resellerShare: {
        resellerId: 'reseller-123',
        token: 'SHARE-TOKEN-99',
        marginPerUnit: 2500000, // ₹25,000 margin (> 40% = 16,000, and > MRP gap 10,000)
        isActive: true,
        resellerStatus: 'APPROVED',
      },
      settings: {
        ...defaultSettings,
        reselling: { ...defaultSettings.reselling, priceMayExceedMrp: true },
      },
    });

    // 40% of 40,000 = 16,000
    expect(res.reselling.marginTotal).toBe(1600000);
    expect(res.itemsTotal).toBe(5600000);
  });

  // Case 26
  it('26. reseller margin is capped by MRP ceiling when priceMayExceedMrp is false', () => {
    // Base ₹40,000, MRP ₹45,000 (gap is only ₹5,000, even if 40% allows ₹16,000)
    const tightMrpItem = {
      ...sampleSherwani,
      baseSellingPrice: 4000000,
      mrp: 4500000,
    };

    const res = calculatePriceBreakup({
      items: [tightMrpItem],
      resellerShare: {
        resellerId: 'reseller-123',
        token: 'SHARE-TOKEN-99',
        marginPerUnit: 1000000, // Requested ₹10,000 margin
        isActive: true,
        resellerStatus: 'APPROVED',
      },
      settings: {
        ...defaultSettings,
        reselling: { ...defaultSettings.reselling, priceMayExceedMrp: false },
      },
    });

    expect(res.reselling.marginTotal).toBe(500000); // Clamped to 5,000
    expect(res.itemsTotal).toBe(4500000); // Exactly equals MRP
  });

  // Case 27
  it('27. product with resellingEnabled=false receives zero margin even with valid share token', () => {
    const nonResellableItem = {
      ...sampleSherwani,
      resellingEnabled: false,
    };

    const res = calculatePriceBreakup({
      items: [nonResellableItem],
      resellerShare: {
        resellerId: 'reseller-123',
        token: 'SHARE-TOKEN-99',
        marginPerUnit: 500000,
        isActive: true,
        resellerStatus: 'APPROVED',
      },
      settings: defaultSettings,
    });

    expect(res.reselling.isResellerOrder).toBe(false);
    expect(res.reselling.marginTotal).toBe(0);
    expect(res.itemsTotal).toBe(4000000); // Stays at base price
  });

  // Case 28
  it('28. suspended or unapproved reseller share falls back to base price with warning', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani],
      resellerShare: {
        resellerId: 'reseller-123',
        token: 'SHARE-TOKEN-99',
        marginPerUnit: 500000,
        isActive: true,
        resellerStatus: 'SUSPENDED', // Not APPROVED
      },
      settings: defaultSettings,
    });

    expect(res.reselling.isResellerOrder).toBe(false);
    expect(res.reselling.marginTotal).toBe(0);
    expect(res.itemsTotal).toBe(4000000);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('invalid or inactive');
  });

  // Case 29
  it('29. coupon is blocked on reseller orders when couponsAllowedOnResellerOrders is false', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani],
      resellerShare: {
        resellerId: 'reseller-123',
        token: 'SHARE-TOKEN-99',
        marginPerUnit: 500000,
        isActive: true,
        resellerStatus: 'APPROVED',
      },
      coupon: {
        code: 'PROMO10',
        type: COUPON_TYPE.PERCENT,
        value: 10,
        scope: COUPON_SCOPE.ALL,
      },
      settings: {
        ...defaultSettings,
        reselling: { ...defaultSettings.reselling, couponsAllowedOnResellerOrders: false },
      },
    });

    expect(res.discount).toBe(0);
    expect(res.couponCode).toBeNull();
    expect(res.warnings).toContain('Coupons cannot be applied to reseller orders.');
  });

  // Case 30
  it('30. coupon applies to reseller orders when couponsAllowedOnResellerOrders is true', () => {
    const res = calculatePriceBreakup({
      items: [sampleSherwani], // 40,000 + 5,000 margin = 45,000 buyer total
      resellerShare: {
        resellerId: 'reseller-123',
        token: 'SHARE-TOKEN-99',
        marginPerUnit: 500000,
        isActive: true,
        resellerStatus: 'APPROVED',
      },
      coupon: {
        code: 'PROMO10',
        type: COUPON_TYPE.PERCENT,
        value: 10, // 10% of 45,000 = 4,500
        scope: COUPON_SCOPE.ALL,
      },
      settings: {
        ...defaultSettings,
        reselling: { ...defaultSettings.reselling, couponsAllowedOnResellerOrders: true },
      },
    });

    expect(res.discount).toBe(450000); // 10% of 45,000
    expect(res.grandTotal).toBe(4500000 - 450000);
  });

  // Case 31
  it('31. throws 400 Bad Request when items array is empty', () => {
    expect(() =>
      calculatePriceBreakup({
        items: [],
        settings: defaultSettings,
      })
    ).toThrow(/empty items list/i);
  });
});

