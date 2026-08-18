import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorSchemaObject } from './Error.ts';

describe('UpstashRedis.schema.Error', () => {
  it('accepts a documented Redis command error', () => {
    const [error, body] = ErrorSchemaObject.safeParse({
      error: "ERR wrong number of arguments for 'get' command",
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      body?.error,
      "ERR wrong number of arguments for 'get' command",
    );
  });

  it('accepts a documented auth error', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({ error: 'WRONGPASS invalid password' })[0],
      null,
    );
  });

  it('rejects an envelope missing `error`', () => {
    asserts.assertExists(ErrorSchemaObject.safeParse({})[0]);
  });

  it('rejects an `error` that is not a coercible primitive', () => {
    // `Guardian.string()` coerces primitives (numbers, booleans) but not
    // objects/arrays — see schema/Command.ts for the full rationale
    // around this library's coerce-by-default string/number guards.
    asserts.assertExists(
      ErrorSchemaObject.safeParse({ error: { nested: true } })[0],
    );
  });
});
