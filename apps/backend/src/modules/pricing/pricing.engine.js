/**
 * Pure Pricing Engine for Younora Luxury Fashion
 * Single source of truth for pricing calculations (docs/PLAN.md §8.1).
 * All inputs and calculations are strictly in integer paise (Rule 7: 1 INR = 100 paise).
 */

const AppError = require('../../core/errors/appError');
const { COUPON_TYPE, COUPON_SCOPE, PAYMENT_METHOD } = require('@younora/shared-constants');

/**
 * Calculates a complete, verified price breakup.
 *
 * @param {Object} params
 * @param {Array<Object>} params.items - Validated line items loaded from DB
 * @param {Object} [params.resellerShare] - Reseller share token & margin details
 * @param {Object} [params.coupon] - Validated coupon object
 * @param {Object} [params.deliveryAddress] - { stateCode, pincode }
 * @param {string} [params.paymentMethod='ONLINE'] - 'ONLINE' or 'COD'
 * @param {Object} params.settings - Store, payments, shipping, tax & reselling settings
 * @returns {Object} Complete structured price breakup
 */
function calculatePriceBreakup({
  items = [],
  resellerShare = null,
  coupon = null,
  deliveryAddress = {},
  paymentMethod = PAYMENT_METHOD.ONLINE,
  settings = {},
}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw AppError.badRequest('Cannot calculate pricing for an empty items list');
  }

  const warnings = [];
  const storeStateCode = String(settings.store?.stateCode || '07').trim();
  const deliveryStateCode = String(deliveryAddress.stateCode || storeStateCode).trim();
  const isTaxInclusive = settings.tax?.pricesInclusiveOfTax !== false; // Default true per luxury standard

  // ---------------------------------------------------------------------------
  // Step 1: Reseller Margin & Effective Selling Price
  // ---------------------------------------------------------------------------
  let isResellerShareValid = false;
  if (resellerShare && resellerShare.token) {
    const isApproved = resellerShare.resellerStatus === 'APPROVED';
    const isActive = resellerShare.isActive === true;
    const isResellingGlobalEnabled = settings.reselling?.enabled !== false;

    if (isApproved && isActive && isResellingGlobalEnabled) {
      isResellerShareValid = true;
    } else {
      warnings.push('Reseller share token is invalid or inactive. Reverted to base prices.');
    }
  }

  let totalResellerMargin = 0;
  let itemsBaseTotal = 0;
  let itemsTotal = 0;

  const processedItems = items.map((item) => {
    const baseSellingPrice = Math.max(0, Math.round(Number(item.baseSellingPrice) || 0));
    const mrp = Math.max(baseSellingPrice, Math.round(Number(item.mrp) || baseSellingPrice));
    const qty = Math.max(1, Math.round(Number(item.qty) || 1));
    const gstPercent = Number(item.gstPercent) || 12;

    itemsBaseTotal += baseSellingPrice * qty;

    let marginPerUnit = 0;
    let isItemResellable = false;

    if (isResellerShareValid && item.resellingEnabled !== false) {
      isItemResellable = true;
      const requestedMargin = Math.max(0, Math.round(Number(resellerShare.marginPerUnit) || 0));

      // Check category margin limits
      const catIdStr = item.categoryId ? item.categoryId.toString() : null;
      const categoryLimits =
        settings.reselling?.marginLimitsByCategory instanceof Map
          ? settings.reselling.marginLimitsByCategory.get(catIdStr)
          : settings.reselling?.marginLimitsByCategory?.[catIdStr];

      let allowedMaxMargin;
      if (categoryLimits && typeof categoryLimits.maxPaise === 'number') {
        allowedMaxMargin = categoryLimits.maxPaise;
      } else {
        const maxPercent =
          categoryLimits?.maxPercent ?? settings.reselling?.defaultMaxMarginPercent ?? 40;
        allowedMaxMargin = Math.round((baseSellingPrice * maxPercent) / 100);
      }

      marginPerUnit = Math.min(requestedMargin, allowedMaxMargin);

      // Enforce MRP ceiling unless priceMayExceedMrp is explicitly true
      const priceMayExceedMrp = Boolean(settings.reselling?.priceMayExceedMrp);
      if (!priceMayExceedMrp && baseSellingPrice + marginPerUnit > mrp) {
        marginPerUnit = Math.max(0, mrp - baseSellingPrice);
      }
    }

    const effectiveSellingPrice = baseSellingPrice + marginPerUnit;
    const lineTotal = effectiveSellingPrice * qty;
    const lineMargin = marginPerUnit * qty;

    itemsTotal += lineTotal;
    totalResellerMargin += lineMargin;

    return {
      variantId: item.variantId,
      productId: item.productId,
      categoryId: item.categoryId,
      name: item.name,
      sku: item.sku,
      color: item.color,
      size: item.size,
      image: item.image,
      hsnCode: item.hsnCode,
      gstPercent,
      mrp,
      baseSellingPrice,
      marginPerUnit,
      effectiveSellingPrice,
      qty,
      lineTotal,
      isItemResellable,
      itemDiscount: 0,
      taxableValue: 0,
      gstAmount: 0,
    };
  });

  const isResellerOrder = totalResellerMargin > 0;

  // ---------------------------------------------------------------------------
  // Step 2: Coupon Validation & Pro-ration
  // ---------------------------------------------------------------------------
  let couponDiscount = 0;
  let appliedCouponCode = null;

  if (coupon && coupon.code) {
    const couponsAllowedOnReselling = Boolean(
      settings.reselling?.couponsAllowedOnResellerOrders
    );

    if (isResellerOrder && !couponsAllowedOnReselling) {
      warnings.push('Coupons cannot be applied to reseller orders.');
    } else if (itemsTotal < (coupon.minCartValue || 0)) {
      warnings.push(`Minimum cart value of ₹${(coupon.minCartValue / 100).toFixed(2)} required for coupon.`);
    } else if (
      coupon.paymentMethodRestriction &&
      coupon.paymentMethodRestriction !== paymentMethod
    ) {
      warnings.push(`Coupon is valid only for ${coupon.paymentMethodRestriction} payments.`);
    } else {
      // Find applicable items based on scope
      const applicableItems = processedItems.filter((item) => {
        if (!coupon.scope || coupon.scope === COUPON_SCOPE.ALL) return true;
        const scopeIds = (coupon.scopeIds || []).map((id) => id.toString());
        if (coupon.scope === COUPON_SCOPE.CATEGORY) {
          return item.categoryId && scopeIds.includes(item.categoryId.toString());
        }
        if (coupon.scope === COUPON_SCOPE.PRODUCT) {
          return item.productId && scopeIds.includes(item.productId.toString());
        }
        return false;
      });

      if (applicableItems.length === 0) {
        warnings.push('Coupon is not applicable to any items in your cart.');
      } else {
        const eligibleSubtotal = applicableItems.reduce((acc, it) => acc + it.lineTotal, 0);

        let rawDiscount = 0;
        if (coupon.type === COUPON_TYPE.PERCENT) {
          rawDiscount = Math.round((eligibleSubtotal * Number(coupon.value)) / 100);
          if (typeof coupon.maxDiscount === 'number' && coupon.maxDiscount > 0) {
            rawDiscount = Math.min(rawDiscount, coupon.maxDiscount);
          }
        } else if (coupon.type === COUPON_TYPE.FLAT) {
          rawDiscount = Math.round(Number(coupon.value));
        }

        couponDiscount = Math.min(rawDiscount, eligibleSubtotal);

        if (couponDiscount > 0) {
          appliedCouponCode = coupon.code;

          // Pro-rate discount across applicable line items
          let distributedSum = 0;
          for (let i = 0; i < applicableItems.length; i += 1) {
            const it = applicableItems[i];
            if (i === applicableItems.length - 1) {
              it.itemDiscount = couponDiscount - distributedSum;
            } else {
              it.itemDiscount = Math.round((it.lineTotal / eligibleSubtotal) * couponDiscount);
              distributedSum += it.itemDiscount;
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3: GST Calculation (Intra-state CGST+SGST vs Inter-state IGST)
  // ---------------------------------------------------------------------------
  let totalTaxableAmount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const isIntraState = deliveryStateCode === storeStateCode;

  for (const item of processedItems) {
    const netBuyerLineTotal = Math.max(0, item.lineTotal - item.itemDiscount);
    const gstRate = item.gstPercent / 100;

    let lineTaxable = 0;
    let lineGst = 0;

    if (isTaxInclusive) {
      lineTaxable = Math.round(netBuyerLineTotal / (1 + gstRate));
      lineGst = netBuyerLineTotal - lineTaxable;
    } else {
      lineTaxable = netBuyerLineTotal;
      lineGst = Math.round(lineTaxable * gstRate);
    }

    item.taxableValue = lineTaxable;
    item.gstAmount = lineGst;
    totalTaxableAmount += lineTaxable;

    if (isIntraState) {
      const halfGst = Math.round(lineGst / 2);
      totalCgst += halfGst;
      totalSgst += lineGst - halfGst;
    } else {
      totalIgst += lineGst;
    }
  }

  const totalGst = totalCgst + totalSgst + totalIgst;

  // ---------------------------------------------------------------------------
  // Step 4: Shipping Fee Calculation
  // ---------------------------------------------------------------------------
  const netGoodsTotal = Math.max(0, itemsTotal - couponDiscount);
  const freeShippingThreshold = Number(settings.shipping?.freeShippingAbove ?? 500000);
  const flatShippingFee = Number(settings.shipping?.flatFee ?? 25000);

  let shippingFee = 0;
  if (netGoodsTotal < freeShippingThreshold) {
    shippingFee = flatShippingFee;
  }

  // ---------------------------------------------------------------------------
  // Step 5: COD Surcharge & Validation
  // ---------------------------------------------------------------------------
  let codFee = 0;
  if (paymentMethod === PAYMENT_METHOD.COD) {
    const codEnabled = settings.payments?.codEnabled !== false;
    const codMin = Number(settings.payments?.codMinOrder ?? 100000);
    const codMax = Number(settings.payments?.codMaxOrder ?? 5000000);
    const configuredCodFee = Number(settings.payments?.codFee ?? 15000);
    const blockedPincodes = Array.isArray(settings.payments?.codBlockedPincodes)
      ? settings.payments.codBlockedPincodes
      : [];

    const deliveryPin = String(deliveryAddress.pincode || '').trim();

    if (!codEnabled) {
      throw AppError.badRequest('Cash on delivery (COD) is currently disabled.');
    }
    if (deliveryPin && blockedPincodes.includes(deliveryPin)) {
      throw AppError.badRequest(`COD is not available for delivery pincode ${deliveryPin}.`);
    }
    if (netGoodsTotal < codMin) {
      throw AppError.badRequest(
        `Minimum order value for COD is ₹${(codMin / 100).toFixed(2)}.`
      );
    }
    if (netGoodsTotal > codMax) {
      throw AppError.badRequest(
        `Maximum order value for COD is ₹${(codMax / 100).toFixed(2)}.`
      );
    }

    codFee = configuredCodFee;
  }

  // ---------------------------------------------------------------------------
  // Step 6: Grand Total & Round-off (Rule 7: integer paise)
  // ---------------------------------------------------------------------------
  let exactGrandTotal = 0;
  if (isTaxInclusive) {
    exactGrandTotal = netGoodsTotal + shippingFee + codFee;
  } else {
    exactGrandTotal = totalTaxableAmount + totalGst + shippingFee + codFee;
  }

  // Standard round-off to nearest integer paise (0 paise remainder)
  const roundOff = 0;
  const grandTotal = exactGrandTotal + roundOff;

  return {
    items: processedItems,
    itemsTotal,
    discount: couponDiscount,
    couponCode: appliedCouponCode,
    taxableAmount: totalTaxableAmount,
    gstTotal: {
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
      total: totalGst,
      isIntraState,
    },
    shippingFee,
    codFee,
    roundOff,
    grandTotal,
    reselling: {
      isResellerOrder,
      resellerId: isResellerOrder ? resellerShare.resellerId : null,
      shareToken: isResellerOrder ? resellerShare.token : null,
      baseAmount: itemsBaseTotal,
      marginTotal: totalResellerMargin,
      buyerAmount: itemsTotal,
    },
    warnings,
  };
}

module.exports = {
  calculatePriceBreakup,
};

