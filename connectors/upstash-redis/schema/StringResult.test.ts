import * as asserts from '@asserts';
import { describe, it } from '@test';
import { StringResultSchemaObject } from './StringResult.ts';

describe('UpstashRedis.schema.StringResult', () => {
  it('accepts a string result', () => {
    const [error, body] = StringResultSchemaObject.safeParse({
      result: 'bar',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.result, 'bar');
  });

  it('accepts a null result (missing key)', () => {
    asserts.assertEquals(
      StringResultSchemaObject.safeParse({ result: null })[0],
      null,
    );
  });

  it('rejects a missing `result` key', () => {
    asserts.assertExists(StringResultSchemaObject.safeParse({})[0]);
  });

  it('rejects a `result` that is not a coercible primitive', () => {
    // `Guardian.string()` coerces numbers/booleans but not objects/arrays
    // — see schema/Command.ts for the full rationale.
    asserts.assertExists(
      StringResultSchemaObject.safeParse({ result: { nested: true } })[0],
    );
  });
});
