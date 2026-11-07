const Order = require('../orders/models/order.model');
const Payment = require('../payments/models/payment.model');
const Cart = require('../cart/models/cart.model');
const Variant = require('../catalog/models/variant.model');
const ResellerShare = require('../pricing/models/resellerShare.model');
const Settings = require('../settings/models/settings.model');
const couponService = require('../pricing/coupon.service');
const { calculatePriceBreakup } = require('../pricing/pricing.engine');
const fifoService = require('../inventory/fifo.service');
const razorpayService = require('../payments/razorpay.service');
const invoiceService = require('../orders/invoice.service');
const { generateOrderNo } = require('../../core/utils/counters');
const eventBus = require('../../core/events/eventBus');
const AppError = require('../../core/errors/appError');
const logger = require('../../core/logger');
const {
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  ORDER_SOURCE,
  ORDER_ITEM_STATUS,
  PRODUCT_STATUS,
  EVENT_NAMES,
} = require('@younora/shared-constants');

class CheckoutService {
  /**
   * Previews checkout calculations and validates stock without committing any reservations.
   */
  async previewCheckout({ customer = null, guestToken = null, body = {} }) {
    const customerId = customer?._id || null;
    const paymentMethod = body.paymentMethod || PAYMENT_METHOD.ONLINE;
    const settings = await Settings.getSettings();

    // 1. Resolve line items: from body or from cart
    let lineItems = [];
    let shareToken = body.shareToken || null;
    let couponCode = body.couponCode || null;

    if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      lineItems = body.items;
    } else {
      const cart = await Cart.findOne(
        customerId ? { customer: customerId } : { guestToken }
      ).lean();

      if (!cart || !cart.items || cart.items.length === 0) {
        throw AppError.badRequest('Your cart is empty');
      }
      lineItems = cart.items.map((i) => ({ variantId: i.variant, qty: i.qty }));
      if (!shareToken && cart.shareToken) shareToken = cart.shareToken;
      if (!couponCode && cart.couponCode) couponCode = cart.couponCode;
    }

    const variantIds = lineItems.map((i) => i.variantId);
    const variants = await Variant.find({ _id: { $in: variantIds } })
      .populate('product')
      .lean();

    const variantMap = new Map();
    variants.forEach((v) => variantMap.set(v._id.toString(), v));

    const pricingEngineItems = [];
    const populatedItems = [];
    const warnings = [];

    for (const item of lineItems) {
      const variant = variantMap.get(item.variantId.toString());
      if (!variant) {
        throw AppError.badRequest(`Variant ${item.variantId} not found`);
      }

      const product = variant.product;
      if (!product || product.isDeleted || product.status !== PRODUCT_STATUS.ACTIVE) {
        throw AppError.badRequest(`Product '${product ? product.name : item.variantId}' is not active`);
      }

      const availableStock = Math.max(0, (variant.stock || 0) - (variant.reservedStock || 0));
      if (item.qty > availableStock) {
        warnings.push(`Only ${availableStock} units of '${product.name} (${variant.size})' remain in stock.`);
      }

      populatedItems.push({
        variant: {
          _id: variant._id,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          mrp: variant.mrp,
          sellingPrice: variant.sellingPrice,
        },
        product: {
          _id: product._id,
          name: product.name,
          slug: product.slug,
          brand: product.brand,
          category: product.category,
        },
        qty: item.qty,
        availableStock,
        isAvailable: availableStock >= item.qty,
      });

      pricingEngineItems.push({
        variantId: variant._id,
        productId: product._id,
        categoryId: product.category,
        qty: item.qty,
        baseSellingPrice: variant.sellingPrice,
        mrp: variant.mrp,
        gstPercent: product.gstPercent || 12,
        resellingEnabled: product.resellingEnabled !== false,
      });
    }

    // 2. Validate reseller share
    let resellerShareData = null;
    if (shareToken) {
      const share = await ResellerShare.findOne({ token: shareToken, isActive: true })
        .populate('reseller')
        .lean();
      if (share) {
        resellerShareData = {
          token: share.token,
          resellerStatus: share.reseller?.resellerStatus || 'PENDING',
          isActive: share.isActive,
          marginPerUnit: share.marginPerUnit,
          productId: share.product?.toString(),
        };
      }
    }

    // 3. Validate coupon
    let validatedCoupon = null;
    if (couponCode) {
      try {
        validatedCoupon = await couponService.validateCouponForCart(couponCode, {
          customerId,
          paymentMethod,
        });
      } catch (couponErr) {
        warnings.push(`Coupon '${couponCode}' cannot be applied: ${couponErr.message}`);
      }
    }

    // 4. Calculate price breakup
    const deliveryAddress = body.shippingAddress || {};
    const pricing = calculatePriceBreakup({
      items: pricingEngineItems,
      resellerShare: resellerShareData,
      coupon: validatedCoupon,
      deliveryAddress: {
        stateCode: deliveryAddress.stateCode || settings.store?.stateCode || '07',
        pincode: deliveryAddress.pincode,
      },
      paymentMethod,
      settings,
    });

    if (pricing.warnings && pricing.warnings.length > 0) {
      warnings.push(...pricing.warnings);
    }

    return {
      items: populatedItems,
      pricing,
      shippingAddress: body.shippingAddress || null,
      paymentMethod,
      warnings: Array.from(new Set(warnings)),
    };
  }

  /**
   * Places an order atomically, reserves inventory via FIFO batches, and creates payment intent
   */
  async placeOrder({ customer = null, guestToken = null, body = {} }) {
    const customerId = customer?._id || null;
    const { idempotencyKey } = body;

    // 1. Check idempotency: deduplicate existing order
    if (idempotencyKey) {
      const existingOrder = await Order.findOne({ idempotencyKey })
        .populate('invoices')
        .lean();
      if (existingOrder) {
        logger.info({ orderNo: existingOrder.orderNo, idempotencyKey }, 'Returning existing idempotent order');
        return {
          order: existingOrder,
          isDuplicate: true,
        };
      }
    }

    // 2. Guest details validation
    let guestInfo = null;
    if (!customerId) {
      if (!body.guest || !body.guest.name || !body.guest.email || !body.guest.phone) {
        throw AppError.badRequest('Guest name, email, and phone are required for guest checkout');
      }
      guestInfo = body.guest;
    }

    const shippingAddress = body.shippingAddress;
    if (!shippingAddress || !shippingAddress.name || !shippingAddress.line1 || !shippingAddress.pincode) {
      throw AppError.badRequest('Valid shipping address is required');
    }
    const billingAddress = body.billingAddress || shippingAddress;
    const paymentMethod = body.paymentMethod || PAYMENT_METHOD.ONLINE;
    const settings = await Settings.getSettings();

    // 3. Resolve line items
    let lineItems = [];
    let shareToken = body.shareToken || null;
    let couponCode = body.couponCode || null;

    let cartDoc = null;
    if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      lineItems = body.items;
    } else {
      cartDoc = await Cart.findOne(
        customerId ? { customer: customerId } : { guestToken }
      );
      if (!cartDoc || !cartDoc.items || cartDoc.items.length === 0) {
        throw AppError.badRequest('Your cart is empty');
      }
      lineItems = cartDoc.items.map((i) => ({ variantId: i.variant, qty: i.qty }));
      if (!shareToken && cartDoc.shareToken) shareToken = cartDoc.shareToken;
      if (!couponCode && cartDoc.couponCode) couponCode = cartDoc.couponCode;
    }

    // 4. Load all variants and products
    const variantIds = lineItems.map((i) => i.variantId);
    const variants = await Variant.find({ _id: { $in: variantIds } })
      .populate('product')
      .lean();

    const variantMap = new Map();
    variants.forEach((v) => variantMap.set(v._id.toString(), v));

    const pricingEngineItems = [];
    for (const item of lineItems) {
      const variant = variantMap.get(item.variantId.toString());
      if (!variant) throw AppError.badRequest(`Variant ${item.variantId} not found`);
      const product = variant.product;
      if (!product || product.isDeleted || product.status !== PRODUCT_STATUS.ACTIVE) {
        throw AppError.badRequest(`Product '${product ? product.name : item.variantId}' is not active`);
      }

      pricingEngineItems.push({
        variantId: variant._id,
        productId: product._id,
        categoryId: product.category,
        qty: item.qty,
        baseSellingPrice: variant.sellingPrice,
        mrp: variant.mrp,
        gstPercent: product.gstPercent || 12,
        resellingEnabled: product.resellingEnabled !== false,
      });
    }

    // 5. Validate reseller share
    let resellerShareData = null;
    let resellerShareDoc = null;
    if (shareToken) {
      resellerShareDoc = await ResellerShare.findOne({ token: shareToken, isActive: true })
        .populate('reseller')
        .lean();
      if (resellerShareDoc) {
        resellerShareData = {
          token: resellerShareDoc.token,
          resellerStatus: resellerShareDoc.reseller?.resellerStatus || 'PENDING',
          isActive: resellerShareDoc.isActive,
          marginPerUnit: resellerShareDoc.marginPerUnit,
          productId: resellerShareDoc.product?.toString(),
        };
      }
    }

    // 6. Validate coupon
    let validatedCoupon = null;
    if (couponCode) {
      validatedCoupon = await couponService.validateCouponForCart(couponCode, {
        customerId,
        paymentMethod,
      });
    }

    // 7. Calculate server-authoritative price breakup
    const pricing = calculatePriceBreakup({
      items: pricingEngineItems,
      resellerShare: resellerShareData,
      coupon: validatedCoupon,
      deliveryAddress: {
        stateCode: shippingAddress.stateCode || settings.store?.stateCode || '07',
        pincode: shippingAddress.pincode,
      },
      paymentMethod,
      settings,
    });

    // 8. Generate atomic order number
    const orderNo = await generateOrderNo();

    // 9. Reserve inventory via FIFO batches (with automatic compensation on failure)
    const reservedBatchRecords = [];
    try {
      for (const item of lineItems) {
        const reservation = await fifoService.reserveStock({
          variantId: item.variantId,
          qty: item.qty,
          refType: 'ORDER',
          refId: orderNo,
          actor: customerId,
          note: `Checkout order reservation ${orderNo}`,
        });

        reservedBatchRecords.push({
          variantId: item.variantId,
          allocations: reservation.allocations,
        });
      }
    } catch (reserveErr) {
      // Rollback any successfully reserved items
      logger.warn({ orderNo, err: reserveErr.message }, 'Checkout reservation failed. Releasing stock.');
      for (const record of reservedBatchRecords) {
        await fifoService.releaseReservation({
          variantId: record.variantId,
          allocations: record.allocations,
          refType: 'ORDER',
          refId: orderNo,
          note: `Rollback failed checkout ${orderNo}`,
        }).catch(() => {});
      }
      throw AppError.conflict(`Stock reservation failed: ${reserveErr.message}`);
    }

    // 10. Assemble order item snapshots
    // If a line was allocated across multiple batches, we map each batch split
    const orderItems = [];
    const pricingLineMap = new Map();
    pricing.items.forEach((pItem) => {
      pricingLineMap.set(pItem.variantId.toString(), pItem);
    });

    for (const record of reservedBatchRecords) {
      const variant = variantMap.get(record.variantId.toString());
      const product = variant.product;
      const pLine = pricingLineMap.get(record.variantId.toString());

      // Get first image for color
      let itemImage = null;
      if (product.colors && Array.isArray(product.colors)) {
        const colorMatch = product.colors.find(
          (c) => c.name.toLowerCase() === (variant.color?.name || '').toLowerCase()
        );
        if (colorMatch && colorMatch.images && colorMatch.images.length > 0) {
          itemImage = colorMatch.images[0].url;
        } else if (product.colors[0]?.images?.[0]) {
          itemImage = product.colors[0].images[0].url;
        }
      }

      for (const alloc of record.allocations) {
        const splitRatio = alloc.qty / pLine.qty;
        const splitTaxable = Math.round((pLine.taxableValue || 0) * splitRatio);
        const splitGst = Math.round((pLine.gstAmount || 0) * splitRatio);
        const splitDiscount = Math.round((pLine.itemDiscount || pLine.discount || 0) * splitRatio);
        const splitLineTotal = pLine.effectiveSellingPrice * alloc.qty;

        orderItems.push({
          product: product._id,
          variant: variant._id,
          name: product.name,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          image: itemImage,
          hsnCode: product.hsnCode || '',
          gstPercent: product.gstPercent || 12,
          batchNo: alloc.batchNo,
          batch: alloc.batchId,
          mrp: variant.mrp,
          baseSellingPrice: variant.sellingPrice,
          marginPerUnit: pLine.marginPerUnit || 0,
          sellingPrice: pLine.effectiveSellingPrice,
          qty: alloc.qty,
          discount: splitDiscount,
          taxableValue: splitTaxable,
          gstAmount: splitGst,
          lineTotal: splitLineTotal,
          itemStatus: ORDER_ITEM_STATUS.ACTIVE,
        });
      }
    }

    // 11. Create Order document
    const isOnline = paymentMethod === PAYMENT_METHOD.ONLINE;
    const initialStatus = isOnline ? ORDER_STATUS.PENDING_PAYMENT : ORDER_STATUS.CONFIRMED;
    const initialPaymentStatus = isOnline ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.COD_PENDING;

    const orderDoc = new Order({
      orderNo,
      customer: customerId,
      guest: guestInfo,
      items: orderItems,
      shippingAddress,
      billingAddress,
      pricing: {
        itemsTotal: pricing.itemsTotal,
        discount: pricing.discount,
        couponCode: pricing.couponCode,
        couponDiscount: pricing.discount,
        taxableAmount: pricing.taxableAmount,
        gstTotal: pricing.gstTotal,
        shippingFee: pricing.shippingFee,
        codFee: pricing.codFee,
        roundOff: pricing.roundOff,
        grandTotal: pricing.grandTotal,
      },
      payment: {
        method: paymentMethod,
        status: initialPaymentStatus,
        paidAt: null,
      },
      status: initialStatus,
      statusHistory: [
        {
          status: initialStatus,
          at: new Date(),
          by: {
            id: customerId,
            role: customer ? 'CUSTOMER' : 'GUEST',
            name: customer ? customer.name : guestInfo.name,
          },
          note: isOnline ? 'Order placed, awaiting online payment' : 'Order placed via Cash on Delivery',
        },
      ],
      reselling: {
        isResellerOrder: pricing.reselling?.isResellerOrder || false,
        reseller: resellerShareDoc?.reseller?._id || null,
        share: resellerShareDoc?._id || null,
        shareToken,
        baseAmount: pricing.reselling?.baseAmount || 0,
        marginTotal: pricing.reselling?.marginTotal || 0,
        buyerAmount: pricing.reselling?.buyerAmount || 0,
      },
      expiresAt: isOnline ? new Date(Date.now() + 15 * 60 * 1000) : null,
      idempotencyKey,
      source: ORDER_SOURCE.WEB,
    });

    let rzpOrder = null;
    if (isOnline) {
      // 12a. Create Razorpay order
      rzpOrder = await razorpayService.createOrder({
        orderNo,
        amount: pricing.grandTotal,
        currency: 'INR',
        notes: {
          customerName: customer ? customer.name : guestInfo.name,
          customerEmail: customer ? customer.email : guestInfo.email,
        },
      });

      orderDoc.payment.razorpayOrderId = rzpOrder.id;

      // Create Payment log
      await Payment.create({
        order: orderDoc._id,
        orderNo,
        method: PAYMENT_METHOD.ONLINE,
        provider: 'RAZORPAY',
        amount: pricing.grandTotal,
        currency: 'INR',
        razorpayOrderId: rzpOrder.id,
        status: 'CREATED',
      });
    } else {
      // 12b. COD Order placed immediately confirmed
      await Payment.create({
        order: orderDoc._id,
        orderNo,
        method: PAYMENT_METHOD.COD,
        provider: 'COD',
        amount: pricing.grandTotal,
        currency: 'INR',
        status: 'CREATED',
      });

      // Commit reservation to sale
      for (const record of reservedBatchRecords) {
        await fifoService.commitReservationToSale({
          variantId: record.variantId,
          allocations: record.allocations,
        }).catch((err) => {
          logger.error({ err, orderNo }, 'Commit sale failed for COD order');
        });
      }

      // Generate Invoices
      const invoices = await invoiceService.generateInvoicesForOrder(orderDoc);
      orderDoc.invoices = invoices.map((inv) => inv._id);

      // Increment coupon usage
      if (validatedCoupon) {
        validatedCoupon.usedCount += 1;
        await validatedCoupon.save().catch(() => {});
      }

      eventBus.publish(EVENT_NAMES.ORDER_PLACED, {
        orderId: orderDoc._id,
        orderNo: orderDoc.orderNo,
        grandTotal: orderDoc.pricing.grandTotal,
        customerName: customer ? customer.name : guestInfo.name,
        customerEmail: customer ? customer.email : guestInfo.email,
      });
    }

    await orderDoc.save();

    // 13. Clear cart if order originated from user's cart
    if (cartDoc) {
      cartDoc.items = [];
      cartDoc.couponCode = null;
      await cartDoc.save().catch(() => {});
    }

    return {
      order: orderDoc,
      payment: isOnline
        ? {
            provider: 'RAZORPAY',
            razorpayOrderId: rzpOrder.id,
            amount: pricing.grandTotal,
            currency: 'INR',
            keyId: razorpayService.getClient().key_id || 'rzp_test_placeholder',
          }
        : {
            provider: 'COD',
            amount: pricing.grandTotal,
            status: 'COD_PENDING',
          },
      isDuplicate: false,
    };
  }
}

module.exports = new CheckoutService();
