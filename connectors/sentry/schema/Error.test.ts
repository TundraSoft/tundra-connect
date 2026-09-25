import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorSchemaObject } from './Error.ts';

describe('Sentry.schema.Error', () => {
  it('accepts a minimal error envelope', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        detail: 'The requested resource does not exist',
      })[0],
      null,
    );
  });

  it('accepts an error envelope with causes', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        detail: 'Invalid request.',
        causes: ["'version' is required"],
      })[0],
      null,
    );
  });

  it('rejects an envelope missing the required detail', () => {
    asserts.assertExists(ErrorSchemaObject.safeParse({ causes: [] })[0]);
  });

  it('rejects a detail that cannot be coerced to a string', () => {
    asserts.assertExists(
      ErrorSchemaObject.safeParse({ detail: {} })[0],
    );
  });
});
