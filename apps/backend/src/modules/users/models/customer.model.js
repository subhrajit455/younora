const mongoose = require('mongoose');
const { RESELLER_STATUS, GENDER } = require('@younora/shared-constants');

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian phone number'],
    },
    passwordHash: {
      type: String,
      select: false,
    },
    gender: {
      type: String,
      enum: Object.values(GENDER),
    },
    dob: {
      type: Date,
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    blockReason: {
      type: String,
      default: null,
    },
    codRestricted: {
      type: Boolean,
      default: false,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    notificationPrefs: {
      orders: { type: Boolean, default: true },
      offers: { type: Boolean, default: true },
      returns: { type: Boolean, default: true },
      reviews: { type: Boolean, default: true },
    },
    // Account lockout fields
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    // Reseller fields (resellerStatus is single source of truth; isReseller is a virtual)
    resellerStatus: {
      type: String,
      enum: Object.values(RESELLER_STATUS),
      default: RESELLER_STATUS.NONE,
      index: true,
    },
    resellerCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    payoutDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Tokens for email verification and password reset (stored hashed)
    emailVerificationTokenHash: {
      type: String,
      select: false,
    },
    emailVerificationExpiresAt: {
      type: Date,
      select: false,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'customers',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: isReseller derived from resellerStatus
customerSchema.virtual('isReseller').get(function () {
  return this.resellerStatus === RESELLER_STATUS.APPROVED;
});

// Method: check if account is currently locked
customerSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method: record failed attempt & optionally lock account
customerSchema.methods.incLoginAttempts = async function (maxAttempts = 5, lockTimeMs = 15 * 60 * 1000) {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { failedLoginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { failedLoginAttempts: 1 } };
  if (this.failedLoginAttempts + 1 >= maxAttempts && !this.isLocked()) {
    updates.$set = { lockUntil: new Date(Date.now() + lockTimeMs) };
  }

  return this.updateOne(updates);
};

// Method: reset login attempts on successful login
customerSchema.methods.resetLoginLock = async function () {
  return this.updateOne({
    $set: { failedLoginAttempts: 0, lastLoginAt: new Date() },
    $unset: { lockUntil: 1 },
  });
};

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;

