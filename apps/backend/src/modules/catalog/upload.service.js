const { Readable } = require('stream');
const cloudinary = require('../../config/cloudinary');
const { env } = require('../../config/env');
const AppError = require('../../core/errors/appError');
const logger = require('../../core/logger');

class UploadService {
  /**
   * Upload an in-memory buffer to Cloudinary
   * @param {Object} options
   * @param {Buffer} options.buffer - file buffer
   * @param {string} [options.folder='general'] - Cloudinary target folder
   * @param {string} [options.filename] - optional original filename
   * @returns {Promise<Object>} { url, publicId, format, width, height, bytes }
   */
  async uploadImage({ buffer, folder = 'general', filename }) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw AppError.badRequest('File buffer is required for upload');
    }

    // In test environment, provide deterministic mock response to avoid external network calls
    if (env.NODE_ENV === 'test') {
      const mockPublicId = `younora/${folder}/test_${Date.now()}`;
      return {
        url: `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/${mockPublicId}.webp`,
        publicId: mockPublicId,
        format: 'webp',
        width: 800,
        height: 800,
        bytes: buffer.length,
        originalFilename: filename || 'test.jpg',
      };
    }

    const cleanFolder = `younora/${folder.replace(/^younora\/?/, '')}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: cleanFolder,
          resource_type: 'image',
        },
        (error, result) => {
          if (error) {
            logger.error({ error }, 'Cloudinary image upload failed');
            return reject(AppError.internal('Image upload failed, please try again'));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            originalFilename: filename || result.original_filename,
          });
        }
      );

      const readableStream = new Readable();
      readableStream.push(buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
  }

  /**
   * Delete an image from Cloudinary by its publicId
   * @param {string} publicId
   * @returns {Promise<Object>}
   */
  async deleteImage(publicId) {
    if (!publicId || typeof publicId !== 'string') {
      throw AppError.badRequest('Valid publicId is required for image deletion');
    }

    if (env.NODE_ENV === 'test') {
      return { result: 'ok', publicId };
    }

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
    } catch (err) {
      logger.error({ error: err, publicId }, 'Cloudinary image deletion failed');
      throw AppError.internal('Failed to delete image from storage');
    }
  }
}

module.exports = new UploadService();

