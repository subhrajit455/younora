const NotificationsService = require('./notifications.service');
const { NOTIFICATION_RECIPIENT_TYPE, TOKEN_AUDIENCE } = require('@younora/shared-constants');
const { sendSuccess } = require('../../core/http/response');

function getRecipientInfo(req) {
  const recipientType =
    req.tokenAudience === TOKEN_AUDIENCE.ADMIN
      ? NOTIFICATION_RECIPIENT_TYPE.ADMIN
      : NOTIFICATION_RECIPIENT_TYPE.CUSTOMER;
  const recipientId = req.user._id;
  return { recipientType, recipientId };
}

class NotificationsController {
  static async listNotifications(req, res, next) {
    try {
      const { recipientType, recipientId } = getRecipientInfo(req);
      const { page, limit, isRead } = req.query;

      const result = await NotificationsService.listNotifications({
        recipientType,
        recipientId,
        page,
        limit,
        isRead,
      });

      return sendSuccess(res, {
        message: 'Notifications retrieved successfully',
        data: result.notifications,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getUnreadCount(req, res, next) {
    try {
      const { recipientType, recipientId } = getRecipientInfo(req);
      const result = await NotificationsService.getUnreadCount({
        recipientType,
        recipientId,
      });

      return sendSuccess(res, {
        message: 'Unread count retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async markRead(req, res, next) {
    try {
      const { recipientType, recipientId } = getRecipientInfo(req);
      const notification = await NotificationsService.markRead({
        recipientType,
        recipientId,
        notificationId: req.params.id,
      });

      return sendSuccess(res, {
        message: 'Notification marked as read',
        data: notification,
      });
    } catch (error) {
      next(error);
    }
  }

  static async markAllRead(req, res, next) {
    try {
      const { recipientType, recipientId } = getRecipientInfo(req);
      const result = await NotificationsService.markAllRead({
        recipientType,
        recipientId,
      });

      return sendSuccess(res, {
        message: 'All notifications marked as read',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteNotification(req, res, next) {
    try {
      const { recipientType, recipientId } = getRecipientInfo(req);
      const result = await NotificationsService.deleteNotification({
        recipientType,
        recipientId,
        notificationId: req.params.id,
      });

      return sendSuccess(res, {
        message: 'Notification deleted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = NotificationsController;

