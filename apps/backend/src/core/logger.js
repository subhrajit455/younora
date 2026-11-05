const pino = require('pino');
const { env } = require('../config/env');

const isDev = env.NODE_ENV === 'development';
const isTest = env.NODE_ENV === 'test';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'accessToken',
  'otp',
  'secret',
  'razorpayKeySecret',
  '*.password',
  '*.token',
  '*.otp',
];

const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport:
    isDev && !isTest
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

module.exports = logger;

