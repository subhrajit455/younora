const app = require('./app');
const { env } = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const logger = require('./core/logger');

let server;

async function startServer() {
  try {
    // Connect to database
    await connectDB();

    server = app.listen(env.PORT, () => {
      logger.info({
        port: env.PORT,
        env: env.NODE_ENV,
        prefix: env.API_PREFIX,
        msg: `🚀 Younora API server running on port ${env.PORT}`,
      });
    });
  } catch (error) {
    logger.fatal({ err: error, msg: 'Server startup failed' });
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info({ signal, msg: 'Received shutdown signal. Closing server...' });

  if (server) {
    server.close(async () => {
      logger.info({ msg: 'HTTP server closed.' });
      try {
        await disconnectDB();
        logger.info({ msg: 'All connections terminated gracefully. Exiting.' });
        process.exit(0);
      } catch (err) {
        logger.error({ err, msg: 'Error closing database connection' });
        process.exit(1);
      }
    });

    // Force shutdown after timeout if graceful close hangs
    setTimeout(() => {
      logger.error({ msg: 'Forced shutdown after timeout' });
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', reason => {
  logger.fatal({ err: reason, msg: 'Unhandled Promise Rejection' });
  process.exit(1);
});

process.on('uncaughtException', err => {
  logger.fatal({ err, msg: 'Uncaught Exception' });
  process.exit(1);
});

// Start the server only when run directly
if (require.main === module) {
  startServer();
}

module.exports = { startServer, gracefulShutdown };

