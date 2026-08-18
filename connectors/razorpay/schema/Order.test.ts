import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CreateOrderRequestSchemaObject,
  orderIdGuard,
  OrderSchemaObject,
} from './Order.ts';

const validOrder = {
  id: 'order_EKwxwAgItmmXdp',
  entity: 'order',
  amount: 29900,
  amount_paid: 0,
  amount_due: 29900,
  currency: 'INR',
  receipt: 'receipt#1',
  offer_id: null,
  status: 'created',
  attempts: 0,
  notes: {},
  created_at: 1582637108,
};

describe('Razorpay.schema.Order', () => {
  describe('orderIdGuard', () => {
    it('accepts a valid order id', () => {
      asserts.assertEquals(
        orderIdGuard.safeParse('order_EKwxwAgItmmXdp')[0],
        null,
      );
    });

    it('rejects an id with the wrong prefix', () => {
      asserts.assertExists(orderIdGuard.safeParse('pay_EKwxwAgItmmXdp')[0]);
    });
  });

  describe('CreateOrderRequestSchemaObject', () => {
    it('accepts a minimal create request (amount + currency only)', () => {
      const [error, parsed] = CreateOrderRequestSchemaObject.safeParse({
        amount: 29900,
        currency: 'INR',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(parsed?.amount, 29900);
    });

    it('accepts a full create request', () => {
      const [error, parsed] = CreateOrderRequestSchemaObject.safeParse({
        amount: 29900,
        currency: 'INR',
        receipt: 'receipt#1',
        notes: { orderId: '1234' },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(parsed?.receipt, 'receipt#1');
    });

    it('rejects a request missing amount', () => {
      asserts.assertExists(
        CreateOrderRequestSchemaObject.safeParse({ currency: 'INR' })[0],
      );
    });

    it('rejects a request missing currency', () => {
      asserts.assertExists(
        CreateOrderRequestSchemaObject.safeParse({ amount: 29900 })[0],
      );
    });

    it('rejects a non-integer amount', () => {
      asserts.assertExists(
        CreateOrderRequestSchemaObject.safeParse({
          amount: 299.5,
          currency: 'INR',
        })[0],
      );
    });

    it('rejects a receipt over 40 characters', () => {
      asserts.assertExists(
        CreateOrderRequestSchemaObject.safeParse({
          amount: 29900,
          currency: 'INR',
          receipt: 'r'.repeat(41),
        })[0],
      );
    });
  });

  describe('OrderSchemaObject', () => {
    it('parses a valid Order response', () => {
      const [error, order] = OrderSchemaObject.safeParse(validOrder);
      asserts.assertEquals(error, null);
      asserts.assertEquals(order?.id, validOrder.id);
      asserts.assertEquals(order?.status, 'created');
    });

    it('normalizes a `notes: []` response quirk to `{}`', () => {
      const [error, order] = OrderSchemaObject.safeParse({
        ...validOrder,
        notes: [],
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(order?.notes, {});
    });

    it('rejects an undocumented status', () => {
      asserts.assertExists(
        OrderSchemaObject.safeParse({ ...validOrder, status: 'bogus' })[0],
      );
    });

    it('rejects a response missing a required field', () => {
      const { id: _id, ...withoutId } = validOrder;
      asserts.assertExists(OrderSchemaObject.safeParse(withoutId)[0]);
    });

    it('keeps unmodeled fields via passthrough', () => {
      const [error, order] = OrderSchemaObject.safeParse({
        ...validOrder,
        checkout: { method: 'link' },
      });
      asserts.assertEquals(error, null);
      // deno-lint-ignore no-explicit-any
      asserts.assertEquals((order as any).checkout.method, 'link');
    });
  });
});
