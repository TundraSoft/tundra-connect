import * as asserts from '@asserts';
import { describe, it } from '@test';
import { IntegerResultSchemaObject } from './IntegerResult.ts';

describe('UpstashRedis.schema.IntegerResult', () => {
  it('accepts a positive integer', () => {
    const [error, body] = IntegerResultSchemaObject.safeParse({ result: 1 });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.result, 1);
  });

  it('accepts zero', () => {
    asserts.assertEquals(
      IntegerResultSchemaObject.safeParse({ result: 0 })[0],
      null,
    );
  });

  it('rejects a non-integer number', () => {
    asserts.assertExists(
      IntegerResultSchemaObject.safeParse({ result: 1.5 })[0],
    );
  });

  it('rejects a non-numeric string result', () => {
    // `Guardian.number()` coerces numeric strings ('1' -> 1) but not
    // non-numeric ones — see schema/Command.ts for the full rationale
    // around this library's coerce-by-default string/number guards.
    asserts.assertExists(
      IntegerResultSchemaObject.safeParse({ result: 'abc' })[0],
    );
  });

  it('rejects a missing `result` key', () => {
    asserts.assertExists(IntegerResultSchemaObject.safeParse({})[0]);
  });
});
