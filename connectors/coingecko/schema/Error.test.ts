import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorEnvelopeSchemaObject } from './Error.ts';

describe('CoinGecko.schema.Error', () => {
  it('accepts shape B (structured status envelope)', () => {
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      status: {
        error_code: 10002,
        error_message: 'missing api key',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (envelope as { error_code?: number }).error_code,
      10002,
    );
    asserts.assertEquals(
      (envelope as { error_message: string }).error_message,
      'missing api key',
    );
  });

  it('accepts shape C (nested error.status envelope)', () => {
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      error: {
        status: { error_code: 10010, error_message: 'wrong host' },
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (envelope as { error_code?: number }).error_code,
      10010,
    );
  });

  it('accepts shape A (flat error string)', () => {
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      error: 'coin not found',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (envelope as { error_message: string }).error_message,
      'coin not found',
    );
    asserts.assertEquals(
      (envelope as { error_code?: number }).error_code,
      undefined,
    );
  });

  it('rejects a payload matching none of the documented shapes', () => {
    asserts.assertExists(
      ErrorEnvelopeSchemaObject.safeParse({ foo: 'bar' })[0],
    );
    asserts.assertExists(ErrorEnvelopeSchemaObject.safeParse('oops')[0]);
    asserts.assertExists(ErrorEnvelopeSchemaObject.safeParse(null)[0]);
  });
});
