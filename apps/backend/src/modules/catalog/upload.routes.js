const express = require('express');
const uploadController = require('./upload.controller');
const authenticate = require('../../core/middleware/authenticate');
const { requirePermission } = require('../../core/middleware/authorize');
const { handleSingleUpload } = require('../../core/middleware/upload');
const { TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');

const uploadRouter = express.Router();

uploadRouter.use(authenticate(TOKEN_AUDIENCE.ADMIN));
uploadRouter.use(requirePermission(PERMISSIONS.CATEGORIES_MANAGE));

uploadRouter.post('/', handleSingleUpload('file'), (req, res, next) =>
  uploadController.uploadImage(req, res, next)
);

// Match wildcards in Express 5 (path-to-regexp v6+)
uploadRouter.delete('/{*publicId}', (req, res, next) =>
  uploadController.deleteImage(req, res, next)
);

module.exports = uploadRouter;
