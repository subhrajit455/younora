const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');

const { env } = require('./config/env');
const logger = require('./core/logger');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const devEmitterRoutes = require('./modules/notifications/devEmitter.routes');
const { registerNotificationSubscribers } = require('./modules/notifications/notifications.subscriber');
const { adminCatalogRouter, storeMenuRouter } = require('./modules/catalog/catalog.routes');
const uploadRouter = require('./modules/catalog/upload.routes');

// Initialize event subscribers
registerNotificationSubscribers();
const notFoundHandler = require('./core/http/notFoundHandler');
const errorMiddleware = require('./core/errors/errorMiddleware');
const AppError = require('./core/errors/appError');
const ERROR_CODES = require('./core/errors/errorCodes');

const app = express();

// Security headers
app.use(helmet());

// Cross-Origin Resource Sharing
const allowedOrigins = env.CORS_ORIGIN.split(',').map(origin => origin.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin)
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new AppError(403, ERROR_CODES.FORBIDDEN, 'CORS not allowed for this origin'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key'],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError(429, ERROR_CODES.RATE_LIMIT_EXCEEDED, 'Too many requests, please try again later'));
  },
});
app.use(limiter);

// Body and cookie parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection (Express 5 compatible)
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.params) mongoSanitize.sanitize(req.params);
  if (req.query) mongoSanitize.sanitize(req.query);
  next();
});

// HTTP Parameter Pollution protection
app.use(hpp());

// HTTP request logging (silent in test)
if (env.NODE_ENV !== 'test') {
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (req, res, err) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: req => ({
          method: req.method,
          url: req.url,
        }),
        res: res => ({
          statusCode: res.statusCode,
        }),
      },
    })
  );
}

// Routes
app.use(env.API_PREFIX, healthRoutes);
app.use(`${env.API_PREFIX}/auth`, authRoutes);
app.use(env.API_PREFIX, usersRoutes);
app.use(env.API_PREFIX, auditRoutes);

if (env.NODE_ENV !== 'production') {
  app.use(`${env.API_PREFIX}/notifications`, devEmitterRoutes);
}

app.use(`${env.API_PREFIX}/notifications`, notificationsRoutes);
app.use(`${env.API_PREFIX}/admin/uploads`, uploadRouter);
app.use(`${env.API_PREFIX}/admin`, adminCatalogRouter);
app.use(`${env.API_PREFIX}/store`, storeMenuRouter);
app.use('/', healthRoutes); // Also expose /health at root for orchestrators

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(errorMiddleware);

module.exports = app;

