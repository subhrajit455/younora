const mongoose = require('mongoose');
const { ROLES, ALL_PERMISSIONS } = require('@younora/shared-constants');

const adminUserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },
    role: {
      type: String,
      enum: [ROLES.SUPER_ADMIN, ROLES.STAFF],
      default: ROLES.STAFF,
      required: true,
      index: true,
    },
    permissions: [
      {
        type: String,
        enum: ALL_PERMISSIONS,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
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
    collection: 'admin_users',
  }
);

// Method: check if account is currently locked
adminUserSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method: record failed attempt & optionally lock account
adminUserSchema.methods.incLoginAttempts = async function (maxAttempts = 5, lockTimeMs = 15 * 60 * 1000) {
  // If a previous lock has expired, reset attempts counter
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
adminUserSchema.methods.resetLoginLock = async function () {
  return this.updateOne({
    $set: { failedLoginAttempts: 0, lastLoginAt: new Date() },
    $unset: { lockUntil: 1 },
  });
};

const AdminUser = mongoose.model('AdminUser', adminUserSchema);

module.exports = AdminUser;

