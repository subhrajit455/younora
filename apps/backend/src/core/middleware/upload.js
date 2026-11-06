const multer = require('multer');
const { env } = require('../../config/env');
const AppError = require('../errors/appError');
const ERROR_CODES = require('../errors/errorCodes');

const storage = multer.memoryStorage();

const allowedMimeTypes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
];

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Invalid file type '${file.mimetype}'. Allowed types: JPEG, JPG, PNG, WEBP, AVIF`
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: env.UPLOAD_MAX_FILE_SIZE_BYTES,
  },
  fileFilter,
});

/**
 * Middleware wrapper to cleanly catch Multer errors and format them as AppErrors
 */
function handleSingleUpload(fieldName = 'file') {
  const multerMiddleware = upload.single(fieldName);

  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            const maxMB = (env.UPLOAD_MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
            return next(
              new AppError(
                400,
                ERROR_CODES.VALIDATION_ERROR,
                `File size exceeds maximum allowed limit of ${maxMB}MB`
              )
            );
          }
          return next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, `Upload error: ${err.message}`));
        }
        return next(err);
      }
      return next();
    });
  };
}

module.exports = {
  upload,
  handleSingleUpload,
};

