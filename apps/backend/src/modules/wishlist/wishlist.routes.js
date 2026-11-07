const express = require('express');
const wishlistController = require('./wishlist.controller');
const authenticate = require('../../core/middleware/authenticate');
const { TOKEN_AUDIENCE } = require('@younora/shared-constants');

const wishlistRouter = express.Router();

// Wishlist requires authenticated Customer token
wishlistRouter.use(authenticate(TOKEN_AUDIENCE.CUSTOMER));

wishlistRouter.get('/', (req, res, next) => wishlistController.getWishlist(req, res, next));
wishlistRouter.get('/check/:productId', (req, res, next) =>
  wishlistController.checkInWishlist(req, res, next)
);
wishlistRouter.post('/:productId', (req, res, next) =>
  wishlistController.addToWishlist(req, res, next)
);
wishlistRouter.delete('/:productId', (req, res, next) =>
  wishlistController.removeFromWishlist(req, res, next)
);

module.exports = wishlistRouter;

