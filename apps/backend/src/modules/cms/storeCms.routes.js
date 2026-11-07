const express = require('express');
const cmsController = require('./cms.controller');
const etagMiddleware = require('../../core/middleware/etag');
const validate = require('../../core/middleware/validate');
const { z } = require('zod');

const storeCmsRouter = express.Router();

// Apply ETag caching on safe GET endpoints
storeCmsRouter.use(etagMiddleware());

const enquirySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Invalid email address'),
  phone: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  message: z.string().trim().min(5, 'Message must be at least 5 characters'),
});

storeCmsRouter.get('/home', (req, res, next) => cmsController.getHomePage(req, res, next));
storeCmsRouter.get('/banners', (req, res, next) => cmsController.getBanners(req, res, next));
storeCmsRouter.get('/pages/:slug', (req, res, next) => cmsController.getCmsPage(req, res, next));
storeCmsRouter.get('/pincode/:pin', (req, res, next) => cmsController.checkPincode(req, res, next));
storeCmsRouter.post('/enquiry', validate({ body: enquirySchema }), (req, res, next) =>
  cmsController.submitEnquiry(req, res, next)
);

module.exports = storeCmsRouter;

