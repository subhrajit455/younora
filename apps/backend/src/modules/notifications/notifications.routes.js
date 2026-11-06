const { Router } = require('express');
const NotificationsController = require('./notifications.controller');
const authenticate = require('../../core/middleware/authenticate');
const validate = require('../../core/middleware/validate');
const { TOKEN_AUDIENCE } = require('@younora/shared-constants');
const {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} = require('./notifications.validation');

const router = Router();

// Protect all notification routes with dual audience (Admin or Customer)
router.use(authenticate([TOKEN_AUDIENCE.ADMIN, TOKEN_AUDIENCE.CUSTOMER]));

router.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  NotificationsController.listNotifications
);

router.get('/unread-count', NotificationsController.getUnreadCount);

// markAllRead must precede /:id/read to prevent route shadowing
router.patch('/read-all', NotificationsController.markAllRead);

router.patch(
  '/:id/read',
  validate({ params: notificationIdParamSchema }),
  NotificationsController.markRead
);

router.delete(
  '/:id',
  validate({ params: notificationIdParamSchema }),
  NotificationsController.deleteNotification
);

module.exports = router;

