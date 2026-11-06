const { Server } = require('socket.io');
const { env } = require('../../config/env');
const { TOKEN_AUDIENCE, ROLES, NOTIFICATION_RECIPIENT_TYPE } = require('@younora/shared-constants');
const socketAuthMiddleware = require('./socketAuth');
const NotificationsService = require('../../modules/notifications/notifications.service');
const logger = require('../logger');

let io = null;

function initSocketServer(httpServer) {
  const allowedOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim());

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error('CORS not allowed for this origin'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  // Apply JWT authentication middleware
  io.use(socketAuthMiddleware);

  io.on('connection', socket => {
    const { user, tokenAudience } = socket;

    if (tokenAudience === TOKEN_AUDIENCE.CUSTOMER) {
      const room = `customer:${user._id}`;
      socket.join(room);
      logger.debug({ userId: user._id, room }, 'Customer joined socket room');
    } else if (tokenAudience === TOKEN_AUDIENCE.ADMIN) {
      const personalRoom = `admin:${user._id}`;
      socket.join(personalRoom);
      socket.join('admin:all');

      if (user.role === ROLES.SUPER_ADMIN) {
        socket.join('admin:super');
      }

      if (Array.isArray(user.permissions)) {
        for (const permission of user.permissions) {
          socket.join(`admin:perm:${permission}`);
        }
      }

      logger.debug({ adminId: user._id, role: user.role }, 'Admin joined socket rooms');
    }

    socket.on('disconnect', reason => {
      logger.debug({ socketId: socket.id, reason }, 'Socket client disconnected');
    });
  });

  // Register real-time dispatcher with NotificationsService
  NotificationsService.setSocketDispatcher(({ recipientType, recipientId, notification, permission = null }) => {
    if (!io) return;

    if (recipientType === NOTIFICATION_RECIPIENT_TYPE.CUSTOMER) {
      io.to(`customer:${recipientId}`).emit('notification:new', notification);
    } else if (recipientType === NOTIFICATION_RECIPIENT_TYPE.ADMIN) {
      if (permission) {
        // Broadcast to permission-specific room AND super admins
        io.to(`admin:perm:${permission}`).to('admin:super').emit('notification:new', notification);
      } else if (recipientId) {
        io.to(`admin:${recipientId}`).emit('notification:new', notification);
      } else {
        io.to('admin:all').emit('notification:new', notification);
      }
    }
  });

  return io;
}

function getIO() {
  return io;
}

async function closeSocketServer() {
  if (io) {
    await new Promise(resolve => io.close(resolve));
    io = null;
  }
}

module.exports = {
  initSocketServer,
  getIO,
  closeSocketServer,
};

