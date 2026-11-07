const Banner = require('./models/banner.model');
const CmsPage = require('./models/cmsPage.model');
const Enquiry = require('./models/enquiry.model');
const Product = require('../catalog/models/product.model');
const Category = require('../catalog/models/category.model');
const AppError = require('../../core/errors/appError');

class CmsService {
  /**
   * Retrieves active promotional banners
   */
  async getActiveBanners(position = null) {
    const now = new Date();
    const filter = {
      isActive: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    };

    if (position) {
      filter.position = position.toUpperCase();
    }

    return Banner.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
  }

  /**
   * Aggregates curated storefront homepage payload
   */
  async getHomePagePayload() {
    const [banners, featured, newArrivals, bestSellers, categories] = await Promise.all([
      this.getActiveBanners('HERO_MAIN'),
      Product.find({ status: 'ACTIVE', isDeleted: false, isFeatured: true })
        .select('_id name slug brand colors priceRange rating isFeatured isNewArrival isBestSeller')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Product.find({ status: 'ACTIVE', isDeleted: false, isNewArrival: true })
        .select('_id name slug brand colors priceRange rating isFeatured isNewArrival isBestSeller')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Product.find({ status: 'ACTIVE', isDeleted: false, isBestSeller: true })
        .select('_id name slug brand colors priceRange rating isFeatured isNewArrival isBestSeller')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Category.find({ isActive: true, isDeleted: false })
        .select('_id name slug image sortOrder audience')
        .populate('audience', 'name slug')
        .sort({ sortOrder: 1 })
        .limit(6)
        .lean(),
    ]);

    return {
      banners,
      featured,
      newArrivals,
      bestSellers,
      categories,
    };
  }

  /**
   * Retrieves public static CMS page by slug
   */
  async getCmsPage(slug) {
    if (!slug) throw AppError.notFound('Page slug is required');

    const page = await CmsPage.findOne({
      slug: slug.toLowerCase().trim(),
      isActive: true,
    }).lean();

    if (!page) {
      throw AppError.notFound(`Page '${slug}' not found`);
    }

    return page;
  }

  /**
   * Validates Indian 6-digit postal code and returns delivery serviceability
   */
  checkPincodeServiceability(pincode) {
    const pin = String(pincode || '').trim();
    const pinRegex = /^[1-9][0-9]{5}$/;

    if (!pinRegex.test(pin)) {
      throw AppError.badRequest('Invalid postal code format: must be a valid 6-digit Indian PIN');
    }

    // Default fast delivery estimation rules based on primary Indian zones
    const firstDigit = pin[0];
    let estimatedDays = 3;
    let zone = 'North';

    if (['4', '5'].includes(firstDigit)) {
      zone = 'West / South';
      estimatedDays = 4;
    } else if (['7', '8'].includes(firstDigit)) {
      zone = 'East / North East';
      estimatedDays = 5;
    }

    return {
      pincode: pin,
      serviceable: true,
      codAvailable: true,
      estimatedDeliveryDays: estimatedDays,
      zone,
      message: `Standard delivery in ${estimatedDays} business days. Cash on delivery available.`,
    };
  }

  /**
   * Creates a public customer enquiry
   */
  async createEnquiry(data) {
    return Enquiry.create({
      name: data.name,
      email: data.email,
      phone: data.phone || '',
      subject: data.subject || 'General Enquiry',
      message: data.message,
    });
  }
}

module.exports = new CmsService();

