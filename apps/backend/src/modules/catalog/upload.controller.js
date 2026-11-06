const uploadService = require('./upload.service');
const { sendSuccess } = require('../../core/http/response');
const AppError = require('../../core/errors/appError');

class UploadController {
  async uploadImage(req, res, next) {
    try {
      if (!req.file) {
        throw AppError.badRequest('Image file is required');
      }

      const folder = req.body.folder || 'general';
      const data = await uploadService.uploadImage({
        buffer: req.file.buffer,
        folder,
        filename: req.file.originalname,
      });

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Image uploaded successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async deleteImage(req, res, next) {
    try {
      let publicId = req.params.publicId || req.params[0] || req.query.publicId;
      if (Array.isArray(publicId)) {
        publicId = publicId.join('/');
      }

      if (!publicId) {
        throw AppError.badRequest('Image publicId is required');
      }

      const data = await uploadService.deleteImage(publicId);

      return sendSuccess(res, {
        message: 'Image deleted successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new UploadController();
