import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorEnvelopeSchemaObject } from './Error.ts';

describe('Algolia.schema.Error', () => {
  it('accepts a documented Algolia error envelope', () => {
    const [error, value] = ErrorEnvelopeSchemaObject.safeParse({
      message: 'Invalid Application-ID or API key',
      status: 403,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.message, 'Invalid Application-ID or API key');
    asserts.assertEquals(value?.status, 403);
  });

  it('rejects an envelope missing message', () => {
    const [error, value] = ErrorEnvelopeSchemaObject.safeParse({
      status: 403,
    });
    asserts.assertExists(error);
    asserts.assertEquals(value, undefined);
  });

  it('rejects an envelope with a non-numeric status', () => {
    const [error, value] = ErrorEnvelopeSchemaObject.safeParse({
      message: 'bad',
      status: 'not-a-number',
    });
    asserts.assertExists(error);
    asserts.assertEquals(value, undefined);
  });

  it('rejects a totally unrelated shape', () => {
    const [error, value] = ErrorEnvelopeSchemaObject.safeParse({
      totally: 'unexpected',
    });
    asserts.assertExists(error);
    asserts.assertEquals(value, undefined);
  });
});
