const mongoose = require('mongoose');
const { NOTIFICATION_RECIPIENT_TYPE } = require('@younora/shared-constants');

const notificationSchema = new mongoose.Schema(
  {
    recipientType: {
      type: String,
      enum: Object.values(NOTIFICATION_RECIPIENT_TYPE),
      required: [true, 'Recipient type is required'],
      index: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Recipient ID is required'],
      refPath: 'recipientModel',
      index: true,
    },
    recipientModel: {
      type: String,
      required: true,
      enum: ['Customer', 'AdminUser'],
      default: function () {
        return this.recipientType === NOTIFICATION_RECIPIENT_TYPE.ADMIN
          ? 'AdminUser'
          : 'Customer';
      },
    },
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    body: {
      type: String,
      required: [true, 'Notification body is required'],
      trim: true,
      maxlength: [1000, 'Body cannot exceed 1000 characters'],
    },
    deepLink: {
      type: String,
      trim: true,
      default: null,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 7776000, // MongoDB TTL index: 90 days (7,776,000 seconds)
    },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    collection: 'notifications',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: isRead
notificationSchema.virtual('isRead').get(function () {
  return !!this.readAt;
});

// Compound indexes for optimal queries
notificationSchema.index({ recipient: 1, recipientType: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;

