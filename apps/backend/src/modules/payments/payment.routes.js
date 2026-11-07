const express = require('express');
const paymentController = require('./payment.controller');

const paymentRouter = express.Router();

paymentRouter.post('/razorpay/verify', (req, res, next) =>
  paymentController.verifyPayment(req, res, next)
);

paymentRouter.post('/razorpay/webhook', (req, res, next) =>
  paymentController.handleWebhook(req, res, next)
);

module.exports = paymentRouter;

