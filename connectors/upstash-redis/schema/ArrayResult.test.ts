import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ArrayResultSchemaObject } from './ArrayResult.ts';

describe('UpstashRedis.schema.ArrayResult', () => {
  it('accepts a list of strings', () => {
    const [error, body] = ArrayResultSchemaObject.safeParse({
      result: ['a', 'b', 'c'],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.result, ['a', 'b', 'c']);
  });

  it('accepts an empty list', () => {
    asserts.assertEquals(
      ArrayResultSchemaObject.safeParse({ result: [] })[0],
      null,
    );
  });

  it('accepts null elements within the list', () => {
    asserts.assertEquals(
      ArrayResultSchemaObject.safeParse({ result: ['a', null, 'c'] })[0],
      null,
    );
  });

  it('rejects a non-array `result`', () => {
    asserts.assertExists(
      ArrayResultSchemaObject.safeParse({ result: 'a' })[0],
    );
  });

  it('rejects a list containing a non-coercible element', () => {
    // `Guardian.string()` coerces numbers/booleans but not objects/arrays
    // — see schema/Command.ts for the full rationale.
    asserts.assertExists(
      ArrayResultSchemaObject.safeParse({ result: ['a', {}] })[0],
    );
  });
});
