import * as asserts from '@asserts';
import { describe, it } from '@test';
import { StatusResultSchemaObject } from './StatusResult.ts';

describe('UpstashRedis.schema.StatusResult', () => {
  it('accepts "OK"', () => {
    const [error, body] = StatusResultSchemaObject.safeParse({
      result: 'OK',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.result, 'OK');
  });

  it('accepts null (conditional SET did not apply)', () => {
    asserts.assertEquals(
      StatusResultSchemaObject.safeParse({ result: null })[0],
      null,
    );
  });

  it('rejects any other string', () => {
    asserts.assertExists(
      StatusResultSchemaObject.safeParse({ result: 'FAIL' })[0],
    );
  });

  it('rejects a missing `result` key', () => {
    asserts.assertExists(StatusResultSchemaObject.safeParse({})[0]);
  });
});
