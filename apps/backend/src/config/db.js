const mongoose = require('mongoose');
const { env } = require('./env');
const logger = require('../core/logger');

let isConnected = false;

async function connectDB(customUri = null) {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = customUri || env.MONGODB_URI;

  try {
    mongoose.connection.on('connected', () => {
      isConnected = true;
      logger.info({ msg: 'MongoDB connected successfully' });
    });

    mongoose.connection.on('error', err => {
      logger.error({ err, msg: 'MongoDB connection error' });
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn({ msg: 'MongoDB disconnected' });
    });

    await mongoose.connect(uri, {
      autoIndex: env.NODE_ENV !== 'production',
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    return mongoose.connection;
  } catch (error) {
    logger.error({ err: error, msg: 'Failed to connect to MongoDB' });
    throw error;
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info({ msg: 'MongoDB connection closed' });
  }
}

function getDatabaseStatus() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] || 'unknown';
}

module.exports = {
  connectDB,
  disconnectDB,
  getDatabaseStatus,
};

