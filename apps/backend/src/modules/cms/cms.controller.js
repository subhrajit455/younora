const cmsService = require('./cms.service');
const { sendSuccess } = require('../../core/http/response');

class CmsController {
  async getHomePage(req, res, next) {
    try {
      const data = await cmsService.getHomePagePayload();
      return sendSuccess(res, {
        message: 'Home page payload retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getBanners(req, res, next) {
    try {
      const data = await cmsService.getActiveBanners(req.query.position);
      return sendSuccess(res, {
        message: 'Active banners retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getCmsPage(req, res, next) {
    try {
      const data = await cmsService.getCmsPage(req.params.slug);
      return sendSuccess(res, {
        message: 'Page content retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async checkPincode(req, res, next) {
    try {
      const data = cmsService.checkPincodeServiceability(req.params.pin);
      return sendSuccess(res, {
        message: 'Pincode serviceability checked',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async submitEnquiry(req, res, next) {
    try {
      const data = await cmsService.createEnquiry(req.body);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Thank you for your enquiry. Our luxury concierge will respond shortly.',
        data: {
          id: data._id,
          name: data.name,
          email: data.email,
          createdAt: data.createdAt,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new CmsController();

