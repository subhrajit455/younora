const mongoose = require('mongoose');
const { USER_TYPES } = require('@younora/shared-constants');

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      refPath: 'userModel',
    },
    userType: {
      type: String,
      enum: Object.values(USER_TYPES),
      required: true,
      index: true,
    },
    userModel: {
      type: String,
      required: true,
      enum: ['AdminUser', 'Customer'],
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    family: {
      type: String,
      required: true,
      index: true,
    },
    replacedByTokenHash: {
      type: String,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
    revokedReason: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL index: automatically deletes expired tokens
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'refresh_tokens',
  }
);

// Compound index for active session querying
refreshTokenSchema.index({ userId: 1, userType: 1, revokedAt: 1, createdAt: -1 });

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

module.exports = RefreshToken;

