import * as asserts from '@asserts';
import { describe, it } from '@test';
import { AnyResultSchemaObject } from './AnyResult.ts';

describe('UpstashRedis.schema.AnyResult', () => {
  it('accepts a string result', () => {
    asserts.assertEquals(
      AnyResultSchemaObject.safeParse({ result: 'OK' })[0],
      null,
    );
  });

  it('accepts a nested array/object result', () => {
    asserts.assertEquals(
      AnyResultSchemaObject.safeParse({ result: [1, 'two', { three: 3 }] })[0],
      null,
    );
  });

  it('accepts a null result', () => {
    asserts.assertEquals(
      AnyResultSchemaObject.safeParse({ result: null })[0],
      null,
    );
  });

  it('rejects a missing `result` key', () => {
    asserts.assertExists(AnyResultSchemaObject.safeParse({})[0]);
  });
});
