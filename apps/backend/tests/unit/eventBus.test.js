const eventBus = require('../../src/core/events/eventBus');
const { EVENT_NAMES } = require('../../src/core/events/events');

describe('Unit: SafeEventBus', () => {
  beforeEach(() => {
    eventBus.clear();
  });

  test('subscribes and executes asynchronous event handler', done => {
    const payload = { orderId: '12345', amount: 50000 };

    eventBus.subscribe(EVENT_NAMES.ORDER_PLACED, received => {
      try {
        expect(received).toEqual(payload);
        done();
      } catch (err) {
        done(err);
      }
    });

    eventBus.publish(EVENT_NAMES.ORDER_PLACED, payload);
  });

  test('publishSync executes handlers sequentially and awaits completion', async () => {
    const executionOrder = [];

    eventBus.subscribe(EVENT_NAMES.STOCK_LOW, async () => {
      executionOrder.push(1);
    });

    eventBus.subscribe(EVENT_NAMES.STOCK_LOW, async () => {
      executionOrder.push(2);
    });

    await eventBus.publishSync(EVENT_NAMES.STOCK_LOW, { sku: 'TEST-SKU' });
    expect(executionOrder).toEqual([1, 2]);
  });

  test('contains errors: a failing subscriber does not crash or break other subscribers', async () => {
    let secondHandlerRan = false;

    eventBus.subscribe(EVENT_NAMES.PAYMENT_FAILED, async () => {
      throw new Error('Simulated subscriber crash');
    });

    eventBus.subscribe(EVENT_NAMES.PAYMENT_FAILED, async () => {
      secondHandlerRan = true;
    });

    await eventBus.publishSync(EVENT_NAMES.PAYMENT_FAILED, { reason: 'card_declined' });
    expect(secondHandlerRan).toBe(true);
  });

  test('unsubscribes handler successfully', async () => {
    let callCount = 0;
    const handler = () => {
      callCount++;
    };

    const unsubscribe = eventBus.subscribe(EVENT_NAMES.ORDER_DELIVERED, handler);
    await eventBus.publishSync(EVENT_NAMES.ORDER_DELIVERED, {});
    expect(callCount).toBe(1);

    unsubscribe();
    await eventBus.publishSync(EVENT_NAMES.ORDER_DELIVERED, {});
    expect(callCount).toBe(1);
  });
});

