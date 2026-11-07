const Cart = require('./models/cart.model');
const Variant = require('../catalog/models/variant.model');
const _Product = require('../catalog/models/product.model');
const ResellerShare = require('../pricing/models/resellerShare.model');
const Settings = require('../settings/models/settings.model');
const couponService = require('../pricing/coupon.service');
const { calculatePriceBreakup } = require('../pricing/pricing.engine');
const AppError = require('../../core/errors/appError');
const { PRODUCT_STATUS, PAYMENT_METHOD } = require('@younora/shared-constants');

class CartService {
  /**
   * Resolves or creates a cart document for a user or guest
   */
  async getOrCreateCart({ customerId = null, guestToken = null }) {
    if (!customerId && !guestToken) {
      throw AppError.badRequest('Either customer authentication or x-guest-token is required');
    }

    let cart;
    if (customerId) {
      cart = await Cart.findOne({ customer: customerId });
      if (!cart) {
        cart = new Cart({ customer: customerId, items: [] });
        await cart.save();
      }
    } else {
      cart = await Cart.findOne({ guestToken });
      if (!cart) {
        cart = new Cart({ guestToken, items: [] });
        await cart.save();
      }
    }

    return cart;
  }

  /**
   * Retrieves enriched cart details with live stock check and full price breakup
   */
  async getCartDetails({ customerId = null, guestToken = null, deliveryPincode = null, paymentMethod = null }) {
    const cart = await this.getOrCreateCart({ customerId, guestToken });

    if (deliveryPincode) {
      cart.deliveryPincode = deliveryPincode;
    }
    if (paymentMethod && Object.values(PAYMENT_METHOD).includes(paymentMethod)) {
      cart.paymentMethod = paymentMethod;
    }

    const settings = await Settings.getSettings();

    // Populate variants and products
    const populatedItems = [];
    const pricingEngineItems = [];
    const warnings = [];

    // Preload all variants
    const variantIds = cart.items.map((i) => i.variant);
    const variants = await Variant.find({ _id: { $in: variantIds } })
      .populate('product')
      .lean();

    const variantMap = new Map();
    variants.forEach((v) => variantMap.set(v._id.toString(), v));

    for (const item of cart.items) {
      const variant = variantMap.get(item.variant.toString());
      if (!variant) {
        warnings.push('An item in your cart is no longer available and was removed.');
        continue;
      }

      const product = variant.product;
      const isProductActive = product && !product.isDeleted && product.status === PRODUCT_STATUS.ACTIVE;
      const isVariantActive = variant.isActive;
      const availableStock = Math.max(0, (variant.stock || 0) - (variant.reservedStock || 0));

      const isAvailable = isProductActive && isVariantActive && availableStock > 0;
      let stockWarning = false;

      if (isAvailable && item.qty > availableStock) {
        stockWarning = true;
        warnings.push(`Only ${availableStock} units of '${product.name} (${variant.size})' remain in stock.`);
      }

      // First image for color option or fallback
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

      populatedItems.push({
        variant: {
          _id: variant._id,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          mrp: variant.mrp,
          sellingPrice: variant.sellingPrice,
          stock: variant.stock,
          isActive: variant.isActive,
        },
        product: {
          _id: product._id,
          name: product.name,
          slug: product.slug,
          brand: product.brand,
          category: product.category,
          image: itemImage,
          resellingEnabled: product.resellingEnabled !== false,
          status: product.status,
        },
        qty: item.qty,
        availableStock,
        isAvailable,
        stockWarning,
        addedAt: item.addedAt,
      });

      if (isAvailable) {
        const effectiveQty = Math.min(item.qty, availableStock);
        pricingEngineItems.push({
          variantId: variant._id,
          productId: product._id,
          categoryId: product.category,
          qty: effectiveQty,
          baseSellingPrice: variant.sellingPrice,
          mrp: variant.mrp,
          gstPercent: product.gstPercent || 12,
          resellingEnabled: product.resellingEnabled !== false,
        });
      }
    }

    // Load reseller share if token is attached
    let resellerShareData = null;
    if (cart.shareToken) {
      const share = await ResellerShare.findOne({ token: cart.shareToken, isActive: true })
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
      } else {
        warnings.push('Reseller link is invalid or expired. Reverted to standard prices.');
      }
    }

    // Validate coupon if applied
    let validatedCoupon = null;
    if (cart.couponCode) {
      try {
        validatedCoupon = await couponService.validateCouponForCart(cart.couponCode, {
          customerId,
          paymentMethod: cart.paymentMethod,
        });
      } catch (err) {
        warnings.push(`Coupon '${cart.couponCode}' could not be applied: ${err.message}`);
        // Reset invalid coupon
        cart.couponCode = null;
        await cart.save();
      }
    }

    let pricing = null;
    if (pricingEngineItems.length > 0) {
      try {
        const rawPricing = calculatePriceBreakup({
          items: pricingEngineItems,
          resellerShare: resellerShareData,
          coupon: validatedCoupon,
          deliveryAddress: {
            pincode: cart.deliveryPincode,
          },
          paymentMethod: cart.paymentMethod,
          settings,
        });

        const totalItemsCount = populatedItems.reduce(
          (acc, i) => acc + (i.isAvailable ? i.qty : 0),
          0
        );

        pricing = {
          ...rawPricing,
          itemsCount: totalItemsCount,
          couponDiscount: rawPricing.discount || 0,
          resellerShare: rawPricing.reselling?.marginTotal || 0,
        };

        if (rawPricing.warnings && rawPricing.warnings.length > 0) {
          warnings.push(...rawPricing.warnings);
        }
      } catch (pricingErr) {
        warnings.push(pricingErr.message);
      }
    }

    return {
      cartId: cart._id,
      items: populatedItems,
      couponCode: cart.couponCode,
      shareToken: cart.shareToken,
      deliveryPincode: cart.deliveryPincode,
      paymentMethod: cart.paymentMethod,
      pricing: pricing || {
        itemsCount: 0,
        itemsTotal: 0,
        discount: 0,
        couponDiscount: 0,
        resellerShare: 0,
        taxableAmount: 0,
        gstTotal: { cgst: 0, sgst: 0, igst: 0, total: 0, isIntraState: true },
        shippingFee: 0,
        codFee: 0,
        roundOff: 0,
        grandTotal: 0,
        reselling: { isResellerOrder: false, marginTotal: 0 },
        lines: [],
      },
      warnings: Array.from(new Set(warnings)),
    };
  }

  /**
   * Adds an item to the cart
   */
  async addItem({ customerId = null, guestToken = null, variantId, qty = 1, shareToken = null }) {
    if (!variantId) {
      throw AppError.badRequest('Variant ID is required');
    }
    const quantity = Math.max(1, parseInt(qty, 10) || 1);

    const variant = await Variant.findById(variantId).populate('product');
    if (!variant || !variant.isActive) {
      throw AppError.badRequest('Variant is not available');
    }

    const product = variant.product;
    if (!product || product.isDeleted || product.status !== PRODUCT_STATUS.ACTIVE) {
      throw AppError.badRequest('Product is not available for purchase');
    }

    const availableStock = Math.max(0, (variant.stock || 0) - (variant.reservedStock || 0));
    if (availableStock <= 0) {
      throw AppError.badRequest('This variant is currently out of stock');
    }

    const cart = await this.getOrCreateCart({ customerId, guestToken });

    if (shareToken) {
      cart.shareToken = shareToken.trim();
    }

    const existingItemIndex = cart.items.findIndex(
      (i) => i.variant.toString() === variant._id.toString()
    );

    if (existingItemIndex > -1) {
      const newQty = cart.items[existingItemIndex].qty + quantity;
      if (newQty > 10) {
        throw AppError.badRequest('Maximum 10 units allowed per item');
      }
      if (newQty > availableStock) {
        throw AppError.badRequest(`Only ${availableStock} units available in stock`);
      }
      cart.items[existingItemIndex].qty = newQty;
    } else {
      if (quantity > 10) {
        throw AppError.badRequest('Maximum 10 units allowed per item');
      }
      if (quantity > availableStock) {
        throw AppError.badRequest(`Only ${availableStock} units available in stock`);
      }
      cart.items.push({
        variant: variant._id,
        product: product._id,
        qty: quantity,
      });
    }

    await cart.save();
    return this.getCartDetails({ customerId, guestToken });
  }

  /**
   * Updates line item quantity
   */
  async updateItemQty({ customerId = null, guestToken = null, variantId, qty }) {
    if (!variantId) {
      throw AppError.badRequest('Variant ID is required');
    }

    const quantity = parseInt(qty, 10);
    const cart = await this.getOrCreateCart({ customerId, guestToken });

    if (quantity <= 0) {
      cart.items = cart.items.filter((i) => i.variant.toString() !== variantId.toString());
      await cart.save();
      return this.getCartDetails({ customerId, guestToken });
    }

    if (quantity > 10) {
      throw AppError.badRequest('Maximum 10 units allowed per item');
    }

    const variant = await Variant.findById(variantId);
    if (!variant || !variant.isActive) {
      throw AppError.badRequest('Variant is no longer active');
    }

    const availableStock = Math.max(0, (variant.stock || 0) - (variant.reservedStock || 0));
    if (quantity > availableStock) {
      throw AppError.badRequest(`Only ${availableStock} units available in stock`);
    }

    const item = cart.items.find((i) => i.variant.toString() === variantId.toString());
    if (!item) {
      throw AppError.notFound('Item not found in cart');
    }

    item.qty = quantity;
    await cart.save();

    return this.getCartDetails({ customerId, guestToken });
  }

  /**
   * Removes an item from the cart
   */
  async removeItem({ customerId = null, guestToken = null, variantId }) {
    if (!variantId) {
      throw AppError.badRequest('Variant ID is required');
    }

    const cart = await this.getOrCreateCart({ customerId, guestToken });
    cart.items = cart.items.filter((i) => i.variant.toString() !== variantId.toString());
    await cart.save();

    return this.getCartDetails({ customerId, guestToken });
  }

  /**
   * Applies coupon to cart
   */
  async applyCoupon({ customerId = null, guestToken = null, code }) {
    if (!code) {
      throw AppError.badRequest('Coupon code is required');
    }

    const coupon = await couponService.validateCouponForCart(code, { customerId });
    const cart = await this.getOrCreateCart({ customerId, guestToken });

    cart.couponCode = coupon.code;
    await cart.save();

    return this.getCartDetails({ customerId, guestToken });
  }

  /**
   * Removes applied coupon from cart
   */
  async removeCoupon({ customerId = null, guestToken = null }) {
    const cart = await this.getOrCreateCart({ customerId, guestToken });
    cart.couponCode = null;
    await cart.save();

    return this.getCartDetails({ customerId, guestToken });
  }

  /**
   * Merges guest cart into authenticated customer cart on login
   */
  async mergeCart({ customerId, guestToken }) {
    if (!customerId) {
      throw AppError.unauthorized('Customer authentication required to merge carts');
    }
    if (!guestToken) {
      return this.getCartDetails({ customerId });
    }

    const guestCart = await Cart.findOne({ guestToken });
    if (!guestCart || guestCart.items.length === 0) {
      return this.getCartDetails({ customerId });
    }

    const customerCart = await this.getOrCreateCart({ customerId });

    // Preload stock for merging
    const guestVariantIds = guestCart.items.map((i) => i.variant);
    const variants = await Variant.find({ _id: { $in: guestVariantIds } }).lean();
    const stockMap = new Map();
    variants.forEach((v) => {
      stockMap.set(v._id.toString(), Math.max(0, (v.stock || 0) - (v.reservedStock || 0)));
    });

    for (const gItem of guestCart.items) {
      const vId = gItem.variant.toString();
      const availableStock = stockMap.get(vId) || 0;
      if (availableStock <= 0) continue;

      const existingIndex = customerCart.items.findIndex(
        (i) => i.variant.toString() === vId
      );

      if (existingIndex > -1) {
        const combined = customerCart.items[existingIndex].qty + gItem.qty;
        customerCart.items[existingIndex].qty = Math.min(10, Math.min(combined, availableStock));
      } else {
        customerCart.items.push({
          variant: gItem.variant,
          product: gItem.product,
          qty: Math.min(10, Math.min(gItem.qty, availableStock)),
        });
      }
    }

    if (!customerCart.shareToken && guestCart.shareToken) {
      customerCart.shareToken = guestCart.shareToken;
    }
    if (!customerCart.couponCode && guestCart.couponCode) {
      customerCart.couponCode = guestCart.couponCode;
    }

    await customerCart.save();
    await Cart.findByIdAndDelete(guestCart._id);

    return this.getCartDetails({ customerId });
  }
}

module.exports = new CartService();
