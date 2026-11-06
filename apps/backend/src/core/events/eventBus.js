const EventEmitter = require('events');
const logger = require('../logger');

class SafeEventBus extends EventEmitter {
  constructor() {
    super();
    // Allow up to 50 listeners per event without memory leak warnings
    this.setMaxListeners(50);
  }

  /**
   * Subscribe to an event with safe error containment
   * @param {string} eventName
   * @param {Function} handler
   */
  subscribe(eventName, handler) {
    const wrappedHandler = async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        logger.error(
          { error, eventName },
          `Unhandled exception in event subscriber for event '${eventName}'`
        );
      }
    };

    // Store reference to original handler for unsubscribe support
    wrappedHandler._originalHandler = handler;
    this.on(eventName, wrappedHandler);
    return () => this.unsubscribe(eventName, handler);
  }

  /**
   * Unsubscribe a handler from an event
   * @param {string} eventName
   * @param {Function} handler
   */
  unsubscribe(eventName, handler) {
    const listeners = this.rawListeners(eventName);
    for (const listener of listeners) {
      if (listener._originalHandler === handler || listener === handler) {
        this.removeListener(eventName, listener);
      }
    }
  }

  /**
   * Publish an event asynchronously to all subscribers
   * @param {string} eventName
   * @param {*} payload
   */
  publish(eventName, payload) {
    setImmediate(() => {
      this.emit(eventName, payload);
    });
  }

  /**
   * Publish an event synchronously (waits for all listeners to finish)
   * Useful in test assertions and critical sequencing
   * @param {string} eventName
   * @param {*} payload
   */
  async publishSync(eventName, payload) {
    const listeners = this.rawListeners(eventName);
    for (const listener of listeners) {
      try {
        await listener(payload);
      } catch (error) {
        logger.error(
          { error, eventName },
          `Unhandled exception in synchronous event subscriber for '${eventName}'`
        );
      }
    }
  }

  /**
   * Clear all subscribers (useful in test teardown)
   */
  clear() {
    this.removeAllListeners();
  }
}

// Singleton event bus
const eventBus = new SafeEventBus();

module.exports = eventBus;

