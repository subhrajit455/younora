const { Router } = require('express');
const { z } = require('zod');
const eventBus = require('../../core/events/eventBus');
const NotificationsService = require('./notifications.service');
const validate = require('../../core/middleware/validate');
const { sendSuccess } = require('../../core/http/response');
const { NOTIFICATION_RECIPIENT_TYPE, EVENT_NAMES } = require('@younora/shared-constants');

const router = Router();

const devEmitSchema = z.object({
  eventName: z.enum(Object.values(EVENT_NAMES)).optional(),
  recipientType: z.enum(Object.values(NOTIFICATION_RECIPIENT_TYPE)).default(NOTIFICATION_RECIPIENT_TYPE.CUSTOMER),
  recipientId: z.string().optional(),
  type: z.string().default('DEV_TEST_NOTICE'),
  title: z.string().default('Test Toast Notification'),
  body: z.string().default('This is a real-time notification preview from Younora dev emitter.'),
  deepLink: z.string().optional(),
  permission: z.string().optional(),
  payload: z.record(z.any()).default({}),
});

router.post('/dev-emit', validate({ body: devEmitSchema }), async (req, res, next) => {
  try {
    const { eventName, recipientType, recipientId, type, title, body, deepLink, permission, payload } = req.body;

    if (eventName) {
      // Publish event onto eventBus
      eventBus.publish(eventName, {
        customerId: recipientId,
        ...payload,
      });
      return sendSuccess(res, {
        message: `Event '${eventName}' emitted onto eventBus`,
        data: { eventName, payload },
      });
    }

    // Direct notification creation
    const notification = await NotificationsService.createNotification({
      recipientType,
      recipient: recipientId || '672b1234567890abcdef1234',
      type,
      title,
      body,
      deepLink,
      permission,
      data: payload,
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Test notification created and dispatched',
      data: notification,
    });
  } catch (error) {
    next(error);
  }
});

// HTML page for real-time browser preview
router.get('/dev-preview', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Younora Live Notifications Preview</title>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f0f11; color: #f4f4f5; padding: 2rem; margin: 0; }
    h1 { color: #d4af37; font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #a1a1aa; font-size: 0.9rem; }
    #toast-container { position: fixed; top: 20px; right: 20px; width: 340px; display: flex; flex-direction: column; gap: 12px; z-index: 9999; }
    .toast { background: #18181b; border: 1px solid #27272a; border-left: 4px solid #d4af37; padding: 14px 18px; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); animation: slideIn 0.3s ease-out; }
    .toast-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 4px; color: #fafafa; }
    .toast-body { font-size: 0.85rem; color: #a1a1aa; line-height: 1.4; }
    .toast-meta { font-size: 0.75rem; color: #71717a; margin-top: 6px; }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; background: #27272a; color: #22c55e; margin-top: 10px; }
  </style>
</head>
<body>
  <h1>Younora Luxury Fashion — Live Notifications</h1>
  <p>Listening for real-time WebSocket events (<code>notification:new</code>)...</p>
  <div id="status" class="status-badge">Connecting...</div>

  <div id="toast-container"></div>

  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const statusEl = document.getElementById('status');
    const container = document.getElementById('toast-container');

    const socket = io({
      auth: { token: token || '' },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      statusEl.textContent = '● Connected (' + socket.id + ')';
      statusEl.style.color = '#22c55e';
    });

    socket.on('connect_error', (err) => {
      statusEl.textContent = '× Connection Error: ' + err.message;
      statusEl.style.color = '#ef4444';
    });

    socket.on('notification:new', (notif) => {
      const el = document.createElement('div');
      el.className = 'toast';
      el.innerHTML = '<div class="toast-title">' + (notif.title || 'Notification') + '</div>' +
                     '<div class="toast-body">' + (notif.body || '') + '</div>' +
                     '<div class="toast-meta">' + (notif.type || '') + ' • ' + new Date().toLocaleTimeString() + '</div>';
      container.prepend(el);
      setTimeout(() => el.remove(), 7000);
    });
  </script>
</body>
</html>`);
});

module.exports = router;

