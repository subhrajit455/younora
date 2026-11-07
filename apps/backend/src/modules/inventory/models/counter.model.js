const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Counter key is required'],
      unique: true,
      trim: true,
    },
    seq: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Atomically increments and returns the next sequence number for a given key.
 * @param {string} key - Counter key (e.g., "batch-2611", "order-2611")
 * @param {mongoose.ClientSession} [session] - Optional transaction session
 * @returns {Promise<number>} Next integer sequence (1-based)
 */
counterSchema.statics.getNextSequence = async function (key, session = undefined) {
  const options = {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  };
  if (session) {
    options.session = session;
  }

  const doc = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    options
  );
  return doc.seq;
};

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

module.exports = Counter;

