const Notification = require('./models/notification.model');
const Customer = require('../users/models/customer.model');
const { NOTIFICATION_RECIPIENT_TYPE } = require('@younora/shared-constants');
const AppError = require('../../core/errors/appError');
const ERROR_CODES = require('../../core/errors/errorCodes');

let socketDispatcher = null;

class NotificationsService {
  /**
   * Register a socket dispatcher callback (used by Slice 3 Socket.IO server)
   * @param {Function} dispatcher
   */
  static setSocketDispatcher(dispatcher) {
    socketDispatcher = dispatcher;
  }

  /**
   * Create a notification with preference validation
   */
  static async createNotification({
    recipientType,
    recipient,
    type,
    title,
    body,
    deepLink = null,
    data = {},
    permission = null, // for permission-targeted admin notifications
  }) {
    const recipientId = recipient._id || recipient.id || recipient;

    // Check customer preferences for optional notification categories
    if (recipientType === NOTIFICATION_RECIPIENT_TYPE.CUSTOMER) {
      const customer = await Customer.findById(recipientId);
      if (customer && customer.notificationPrefs) {
        // e.g. marketing offers or reviews
        if (type.toLowerCase().includes('offer') && customer.notificationPrefs.offers === false) {
          return null; // Opted out
        }
        if (type.toLowerCase().includes('review') && customer.notificationPrefs.reviews === false) {
          return null; // Opted out
        }
      }
    }

    const notification = await Notification.create({
      recipientType,
      recipient: recipientId,
      type,
      title,
      body,
      deepLink,
      data,
    });

    // Real-time dispatch over Socket.IO if dispatcher registered
    if (typeof socketDispatcher === 'function') {
      try {
        socketDispatcher({
          recipientType,
          recipientId: recipientId.toString(),
          notification: notification.toJSON(),
          permission,
        });
      } catch {
        // Socket emission failure should never throw or break database operations
      }
    }

    return notification;
  }

  /**
   * List paginated notifications for recipient
   */
  static async listNotifications({
    recipientType,
    recipientId,
    page = 1,
    limit = 20,
    isRead,
  }) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;

    const filter = {
      recipientType,
      recipient: recipientId,
    };

    if (isRead === true || isRead === 'true') {
      filter.readAt = { $ne: null };
    } else if (isRead === false || isRead === 'false') {
      filter.readAt = null;
    }

    const skip = (pageNum - 1) * limitNum;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Notification.countDocuments(filter),
      Notification.countDocuments({
        recipientType,
        recipient: recipientId,
        readAt: null,
      }),
    ]);

    return {
      notifications,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        unreadCount,
      },
    };
  }

  /**
   * Get unread notifications count
   */
  static async getUnreadCount({ recipientType, recipientId }) {
    const unreadCount = await Notification.countDocuments({
      recipientType,
      recipient: recipientId,
      readAt: null,
    });

    return { unreadCount };
  }

  /**
   * Mark single notification as read
   */
  static async markRead({ recipientType, recipientId, notificationId }) {
    const notification = await Notification.findOne({
      _id: notificationId,
      recipientType,
      recipient: recipientId,
    });

    if (!notification) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Notification not found');
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await notification.save();
    }

    return notification;
  }

  /**
   * Mark all unread notifications as read
   */
  static async markAllRead({ recipientType, recipientId }) {
    const result = await Notification.updateMany(
      {
        recipientType,
        recipient: recipientId,
        readAt: null,
      },
      {
        $set: { readAt: new Date() },
      }
    );

    return {
      updatedCount: result.modifiedCount,
    };
  }

  /**
   * Delete single notification
   */
  static async deleteNotification({ recipientType, recipientId, notificationId }) {
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipientType,
      recipient: recipientId,
    });

    if (!notification) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Notification not found');
    }

    return {
      id: notificationId,
      deleted: true,
    };
  }
}

module.exports = NotificationsService;
