# Phase B2 Sign-Off Document: In-App Notifications & Event System

## Status
- **Phase:** B2 — In-App Notifications & Event System
- **Target Tag:** `v0.2.0`
- **Current Status:** Completed & Ready for Release Tag
- **Completion Date:** 2026-11-06

---

## Architecture & Configuration Decisions
1. **Event Backbone (`core/events/eventBus.js`):**
   - Uses an isolated `SafeEventBus` class wrapping Node's `EventEmitter` with asynchronous error containment (`try/catch` + Pino logger error reporting).
   - Domain errors or subscriber exceptions never crash the publisher, bubble into the HTTP request/response cycle, or block subsequent subscribers.
2. **Canonical Event Names (`core/events/events.js`):**
   - Centralized in `@younora/shared-constants` (`EVENT_NAMES`) and re-exported in `core/events/events.js`.
   - Canonical events implemented: `order.placed`, `order.cancelled`, `stock.low`, `reseller.applied`, `reseller.approved`, `payout.processed`, `return.requested`, `staff.invited`.
3. **Dedicated Notifications Store (`notifications` collection):**
   - MongoDB TTL index (`expires: 7776000` = 90 days) on `createdAt` for automated document purging.
   - Recipient polymorphism: `recipientType` (`CUSTOMER` or `ADMIN`), `recipient` (ObjectId), `recipientModel` (`Customer` or `AdminUser`).
   - Virtual property `isRead` derived from `readAt != null`.
   - Compound query indexes on `{ recipient: 1, recipientType: 1, readAt: 1, createdAt: -1 }`.
4. **Socket.IO Transport & Room Topology (`core/socket/`):**
   - Real-time notification dispatch via Socket.IO server bound to HTTP server in `src/server.js`.
   - Handshake authentication using JWT access tokens with audience verification (`younora:admin` vs `younora:customer`) and live user/blocked verification.
   - Dedicated room routing:
     - `customer:<id>` for individual customer alerts.
     - `admin:<id>` for direct staff alerts.
     - `admin:perm:<perm>` for permission-targeted alerts (e.g. `inventory.read` for stock alerts).
     - `admin:super` for Super Admins.
5. **Customer Notification Preferences:**
   - Evaluated against `customer.notificationPrefs` before dispatching non-transactional marketing alerts.
6. **Dual-Audience Authentication:**
   - `authenticate` middleware upgraded to accept arrays of audiences (`[TOKEN_AUDIENCE.ADMIN, TOKEN_AUDIENCE.CUSTOMER]`), allowing endpoints like `/api/v1/notifications` to serve both admin and customer contexts seamlessly.
7. **Developer Testing Infrastructure:**
   - `POST /api/v1/notifications/dev-emit`: Restricted to non-production environments (`NODE_ENV !== 'production'`) for triggering synthetic events and direct notification dispatch.
   - `GET /api/v1/notifications/dev-preview?token=<token>`: HTML/Socket.IO browser harness for inspecting live real-time toasts and rooms.

---

## Slice Progress Tracker

- [x] **Slice 1: Event Bus & Notifications Model**
  - Installed `socket.io` and `socket.io-client`
  - `@younora/shared-constants` (`NOTIFICATION_RECIPIENT_TYPE`, `EVENT_NAMES`)
  - `apps/backend/src/core/events/events.js`
  - `apps/backend/src/core/events/eventBus.js` (`SafeEventBus` with asynchronous error containment)
  - `apps/backend/src/modules/notifications/models/notification.model.js` (90-day TTL index, virtual `isRead`)
  - `tests/unit/eventBus.test.js` (4 tests)
  - `tests/unit/notificationModel.test.js` (5 tests)

- [x] **Slice 2: Notification Service & REST APIs**
  - Upgraded `authenticate` middleware to support multi-audience arrays (`[TOKEN_AUDIENCE.ADMIN, TOKEN_AUDIENCE.CUSTOMER]`)
  - `apps/backend/src/modules/notifications/notifications.validation.js` (Zod schemas for query, param, body)
  - `apps/backend/src/modules/notifications/notifications.service.js` (pagination, preference checks, mark read/read-all, hard delete)
  - `apps/backend/src/modules/notifications/notifications.controller.js` (REST actions)
  - `apps/backend/src/modules/notifications/notifications.routes.js` mounted at `/api/v1/notifications`
  - `tests/integration/notificationsRest.test.js` (11 tests)

- [x] **Slice 3: Socket.IO Server & Real-Time Room Routing**
  - `apps/backend/src/core/socket/socketAuth.js` (JWT handshake auth with audience & blocked check)
  - `apps/backend/src/core/socket/socketServer.js` (`initSocketServer`, `getSocketServer`, `dispatchNotification`, room topology)
  - Integrated Socket.IO attachment & graceful shutdown in `apps/backend/src/server.js`
  - `tests/integration/notificationsSocket.test.js` (7 tests)

- [x] **Slice 4: Templates, Event Subscriber & Dev Verification**
  - `apps/backend/src/modules/notifications/templates/templates.js` (canonical template engine)
  - `apps/backend/src/modules/notifications/notifications.subscriber.js` (registers listeners for all domain events)
  - `apps/backend/src/modules/notifications/devEmitter.routes.js` (`POST /dev-emit` & `GET /dev-preview`)
  - Subscriber registered at application startup in `apps/backend/src/app.js`
  - `tests/integration/notificationsSubscriber.test.js` (6 tests)

---

## Verification & Test Metrics
- **Total Test Suites:** 14 passed / 14 total
- **Total Tests:** 133 passed / 133 total (0 failures)
  - `eventBus.test.js`: 4 passed
  - `notificationModel.test.js`: 5 passed
  - `notificationsRest.test.js`: 11 passed
  - `notificationsSocket.test.js`: 7 passed
  - `notificationsSubscriber.test.js`: 6 passed
  - `adminAuth.test.js`: 16 passed
  - `staffManagement.test.js`: 15 passed
  - `customerAuth.test.js`: 15 passed
  - `profileAndAddress.test.js`: 15 passed
  - `auditLogging.test.js`: 13 passed
  - `models.test.js`: 11 passed
  - `error.test.js`: 6 passed
  - `health.test.js`: 4 passed
  - `env.test.js`: 4 passed
- **Linter Status:** ESLint 0 errors, 0 warnings
