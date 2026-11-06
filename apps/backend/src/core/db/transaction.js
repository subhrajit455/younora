const mongoose = require('mongoose');

/**
 * Executes a function within a MongoDB transaction session.
 * If running on a standalone database (e.g. local single instance without replica set or basic in-memory runner),
 * gracefully falls back to executing the operations directly without a transaction session.
 *
 * @param {Function} fn - async function receiving (session)
 * @returns {Promise<any>}
 */
async function withTransaction(fn) {
  let session;
  try {
    session = await mongoose.startSession();
  } catch {
    // If sessions cannot be created, execute directly
    return fn(undefined);
  }

  try {
    session.startTransaction();
    try {
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (innerError) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      // Check if error is due to standalone instance not supporting replica set transactions
      if (
        innerError.code === 20 ||
        (innerError.message && innerError.message.includes('replica set member'))
      ) {
        return await fn(undefined);
      }
      throw innerError;
    }
  } catch (outerError) {
    if (
      outerError.code === 20 ||
      (outerError.message && outerError.message.includes('replica set member'))
    ) {
      return await fn(undefined);
    }
    throw outerError;
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

module.exports = {
  withTransaction,
};
