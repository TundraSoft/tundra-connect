import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  BatchOrdersResponseSchemaObject,
  CancelAckSchemaObject,
  OrderAckSchemaObject,
  OrderSchemaObject,
  OrdersPageSchemaObject,
  SingleOrderSchemaObject,
} from './Order.ts';

describe('OrderAck schema', () => {
  it('parses a flat create-order response and coerces fixed-point strings', () => {
    const ack = OrderAckSchemaObject.parse({
      order_id: 'o1',
      client_order_id: 'c1',
      fill_count: '3.00',
      remaining_count: '0.00',
      average_fill_price: '0.41',
      ts_ms: 1700000000123,
    });
    asserts.assertEquals(ack.orderId, 'o1');
    asserts.assertEquals(ack.fillCount, 3);
    asserts.assertEquals(ack.averageFillPrice, 0.41);
  });

  it('tolerates a response with no fill (resting GTC order)', () => {
    const ack = OrderAckSchemaObject.parse({ order_id: 'o1', ts_ms: 1 });
    asserts.assertEquals(ack.averageFillPrice, undefined);
  });

  it('rejects a response missing the required order_id', () => {
    asserts.assertThrows(() => OrderAckSchemaObject.parse({ ts_ms: 1 }));
  });

  it('rejects an empty-string fill price rather than silently coercing it to 0', () => {
    // Regression: a hand-rolled `Number('')` used to silently produce 0
    // here, which would have poisoned a real fill's `actualPrice`/
    // `slippage` in Kalshi.ts instead of leaving it `undefined`.
    asserts.assertThrows(() =>
      OrderAckSchemaObject.parse({
        order_id: 'o1',
        fill_count: '3.00',
        average_fill_price: '',
      })
    );
  });
});

describe('CancelAck schema', () => {
  it('parses the cancel response shape (reducedBy, not remainingCount)', () => {
    const ack = CancelAckSchemaObject.parse({
      order_id: 'o1',
      client_order_id: 'c1',
      reduced_by: '10.00',
      ts_ms: 1715793660456,
    });
    asserts.assertEquals(ack.reducedBy, 10);
  });

  it('rejects a response missing the required reduced_by', () => {
    asserts.assertThrows(() => CancelAckSchemaObject.parse({ order_id: 'o1' }));
  });
});

describe('Order schema', () => {
  it('parses a resting order from the list surface', () => {
    const order = OrderSchemaObject.parse({
      order_id: 'o1',
      ticker: 'T',
      status: 'resting',
      book_side: 'bid',
      outcome_side: 'yes',
      fill_count_fp: '0.00',
      remaining_count_fp: '3.00',
    });
    asserts.assertEquals(order.status, 'resting');
    asserts.assertEquals(order.remainingCount, 3);
  });

  it('parses a page and unwraps a single order envelope', () => {
    const page = OrdersPageSchemaObject.parse({
      orders: [{ order_id: 'o1', ticker: 'T', status: 'resting' }],
      cursor: '',
    });
    asserts.assertEquals(page.orders.length, 1);
    const single = SingleOrderSchemaObject.parse({
      order: { order_id: 'o1', ticker: 'T', status: 'executed' },
    });
    asserts.assertEquals(single.status, 'executed');
  });

  it('defaults an absent orders array to empty', () => {
    const page = OrdersPageSchemaObject.parse({});
    asserts.assertEquals(page.orders, []);
  });
});

describe('BatchOrdersResponse schema', () => {
  it('parses a mixed success/error batch response', () => {
    const result = BatchOrdersResponseSchemaObject.parse({
      orders: [
        { order_id: 'a', fill_count: '1.00', ts_ms: 1 },
        { order_id: 'b', error: { code: 'bad', message: 'nope' } },
      ],
    });
    asserts.assertEquals(result.orders.length, 2);
    asserts.assertEquals(result.orders[0]!.orderId, 'a');
    asserts.assertEquals(result.orders[0]!.error, undefined);
    asserts.assertEquals(result.orders[1]!.error?.code, 'bad');
  });

  it('parses a batch cancel response row shape (reducedBy)', () => {
    const result = BatchOrdersResponseSchemaObject.parse({
      orders: [{ order_id: 'a', reduced_by: '1.00' }],
    });
    asserts.assertEquals(result.orders[0]!.reducedBy, 1);
  });
});
