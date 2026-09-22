import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ClobCancelResponseSchemaObject,
  ClobPostOrderResponseSchemaObject,
  ClobPostOrdersResponseSchemaObject,
} from './ClobOrder.ts';

describe('ClobOrder schemas', () => {
  it('parses a matched order response and normalizes orderID to orderId', () => {
    const result = ClobPostOrderResponseSchemaObject.parse({
      status: 'matched',
      makingAmount: '4.95',
      takingAmount: '9',
      orderID: 'abc123',
    });
    asserts.assertEquals(result.status, 'matched');
    asserts.assertEquals(result.orderId, 'abc123');
  });

  it('accepts an already-camelCase orderId (bulk-path shape)', () => {
    const result = ClobPostOrderResponseSchemaObject.parse({ orderId: 'xyz' });
    asserts.assertEquals(result.orderId, 'xyz');
  });

  it('tolerates a rejection body with only an error message', () => {
    const result = ClobPostOrderResponseSchemaObject.parse({
      errorMsg: 'no orders found to match with FAK order',
    });
    asserts.assertEquals(
      result.errorMsg,
      'no orders found to match with FAK order',
    );
    asserts.assertEquals(result.orderId, undefined);
  });

  it('parses a cancel response, normalizing not_canceled to notCanceled', () => {
    const result = ClobCancelResponseSchemaObject.parse({
      canceled: ['a', 'b'],
      not_canceled: { c: 'order already matched' },
    });
    asserts.assertEquals(result.canceled, ['a', 'b']);
    asserts.assertEquals(result.notCanceled, { c: 'order already matched' });
  });

  it('defaults an absent canceled/not_canceled to empty', () => {
    const result = ClobCancelResponseSchemaObject.parse({});
    asserts.assertEquals(result.canceled, []);
    asserts.assertEquals(result.notCanceled, {});
  });

  it('normalizes tradeIDs and retry_after_seconds', () => {
    const result = ClobPostOrderResponseSchemaObject.parse({
      status: 'matched',
      tradeIDs: ['t1', 't2'],
      retry_after_seconds: 5,
    });
    asserts.assertEquals(result.tradeIds, ['t1', 't2']);
    asserts.assertEquals(result.retryAfterSeconds, 5);
  });

  it('captures a machine-readable error code', () => {
    const result = ClobPostOrderResponseSchemaObject.parse({
      errorMsg: 'trading disabled',
      code: 'TRADING_DISABLED',
    });
    asserts.assertEquals(result.code, 'TRADING_DISABLED');
  });

  it('parses a bulk response as an array of per-order results', () => {
    const results = ClobPostOrdersResponseSchemaObject.parse([
      { status: 'live', orderID: 'a' },
      { errorMsg: 'owner/signer mismatch' },
    ]);
    asserts.assertEquals(results.length, 2);
    asserts.assertEquals(results[0]!.orderId, 'a');
    asserts.assertEquals(results[1]!.errorMsg, 'owner/signer mismatch');
  });
});
