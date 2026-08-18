import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CreateOrderRequestSchemaObject,
  ItemSchemaObject,
  OrderSchemaObject,
} from './Order.ts';

describe('PayPal.schema.Order', () => {
  describe('CreateOrderRequestSchemaObject', () => {
    it('accepts a minimal documented create-order request', () => {
      const [error, request] = CreateOrderRequestSchemaObject.safeParse({
        intent: 'CAPTURE',
        purchase_units: [
          { amount: { currency_code: 'USD', value: '10.00' } },
        ],
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(request?.intent, 'CAPTURE');
      asserts.assertEquals(request?.purchase_units.length, 1);
    });

    it('accepts a full request with items, breakdown, and application_context', () => {
      const [error, request] = CreateOrderRequestSchemaObject.safeParse({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: 'PUHF',
            amount: {
              currency_code: 'USD',
              value: '21.00',
              breakdown: {
                item_total: { currency_code: 'USD', value: '20.00' },
                shipping: { currency_code: 'USD', value: '1.00' },
              },
            },
            items: [
              {
                name: 'Widget',
                quantity: '2',
                unit_amount: { currency_code: 'USD', value: '10.00' },
                category: 'PHYSICAL_GOODS',
              },
            ],
          },
        ],
        application_context: {
          brand_name: 'Acme',
          return_url: 'https://example.com/return',
          cancel_url: 'https://example.com/cancel',
          user_action: 'PAY_NOW',
        },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(
        request?.purchase_units[0]?.items?.[0]?.name,
        'Widget',
      );
      asserts.assertEquals(
        request?.application_context?.user_action,
        'PAY_NOW',
      );
    });

    it('rejects an invalid intent', () => {
      asserts.assertExists(
        CreateOrderRequestSchemaObject.safeParse({
          intent: 'REFUND',
          purchase_units: [
            { amount: { currency_code: 'USD', value: '10.00' } },
          ],
        })[0],
      );
    });

    it('rejects an empty purchase_units array', () => {
      asserts.assertExists(
        CreateOrderRequestSchemaObject.safeParse({
          intent: 'CAPTURE',
          purchase_units: [],
        })[0],
      );
    });

    it('rejects a purchase unit missing amount', () => {
      asserts.assertExists(
        CreateOrderRequestSchemaObject.safeParse({
          intent: 'CAPTURE',
          purchase_units: [{}],
        })[0],
      );
    });

    it('rejects a request missing intent or purchase_units', () => {
      asserts.assertExists(
        CreateOrderRequestSchemaObject.safeParse({
          purchase_units: [
            { amount: { currency_code: 'USD', value: '10.00' } },
          ],
        })[0],
      );
      asserts.assertExists(
        CreateOrderRequestSchemaObject.safeParse({ intent: 'CAPTURE' })[0],
      );
    });
  });

  describe('ItemSchemaObject', () => {
    it('accepts a documented item', () => {
      const [error, item] = ItemSchemaObject.safeParse({
        name: 'Widget',
        quantity: '3',
        unit_amount: { currency_code: 'USD', value: '5.00' },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(item?.quantity, '3');
    });

    it('rejects a quantity of "0" (pattern requires a leading 1-9 digit)', () => {
      asserts.assertExists(
        ItemSchemaObject.safeParse({
          name: 'Widget',
          quantity: '0',
          unit_amount: { currency_code: 'USD', value: '5.00' },
        })[0],
      );
    });

    it('rejects a non-numeric quantity', () => {
      asserts.assertExists(
        ItemSchemaObject.safeParse({
          name: 'Widget',
          quantity: 'two',
          unit_amount: { currency_code: 'USD', value: '5.00' },
        })[0],
      );
    });
  });

  describe('OrderSchemaObject', () => {
    it('accepts a documented order response', () => {
      const [error, order] = OrderSchemaObject.safeParse({
        id: '5O190127TN364715T',
        status: 'CREATED',
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: 'default',
            amount: { currency_code: 'USD', value: '10.00' },
          },
        ],
        links: [
          {
            href: 'https://api-m.sandbox.paypal.com/v2/checkout/orders/5O19',
            rel: 'self',
            method: 'GET',
          },
        ],
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(order?.status, 'CREATED');
    });

    it('accepts a captured order response with purchase_units[].payments.captures', () => {
      const [error, order] = OrderSchemaObject.safeParse({
        id: '5O190127TN364715T',
        status: 'COMPLETED',
        purchase_units: [
          {
            amount: { currency_code: 'USD', value: '10.00' },
            payments: {
              captures: [
                {
                  id: '3C679366HH908993F',
                  status: 'COMPLETED',
                  amount: { currency_code: 'USD', value: '10.00' },
                  final_capture: true,
                },
              ],
            },
          },
        ],
        links: [],
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(
        order?.purchase_units[0]?.payments?.captures?.[0]?.status,
        'COMPLETED',
      );
    });

    it('accepts an unmodeled extra field on the order (passthrough)', () => {
      const [error, order] = OrderSchemaObject.safeParse({
        id: '5O190127TN364715T',
        status: 'CREATED',
        purchase_units: [
          { amount: { currency_code: 'USD', value: '10.00' } },
        ],
        links: [],
        payment_source: { paypal: { email_address: 'buyer@example.com' } },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(order?.id, '5O190127TN364715T');
    });

    it('rejects an undocumented status value', () => {
      asserts.assertExists(
        OrderSchemaObject.safeParse({
          id: '5O190127TN364715T',
          status: 'CANCELLED',
          purchase_units: [],
          links: [],
        })[0],
      );
    });

    it('rejects a response missing required fields', () => {
      asserts.assertExists(
        OrderSchemaObject.safeParse({ id: '5O190127TN364715T' })[0],
      );
    });
  });
});
