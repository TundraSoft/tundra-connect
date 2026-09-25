import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorEnvelopeSchemaObject } from './Error.ts';

describe('Slack.schema.Error', () => {
  it('accepts a success envelope', () => {
    asserts.assertEquals(
      ErrorEnvelopeSchemaObject.safeParse({ ok: true })[0],
      null,
    );
  });

  it('accepts an ok:false envelope with an error string', () => {
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      ok: false,
      error: 'channel_not_found',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.error, 'channel_not_found');
  });

  it('accepts a success envelope carrying a non-fatal warning', () => {
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      ok: true,
      warning: 'missing_charset',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.warning, 'missing_charset');
  });

  it('passes through undocumented fields', () => {
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      ok: false,
      error: 'invalid_auth',
      response_metadata: { messages: ['deprecated'] },
    });
    asserts.assertEquals(error, null);
    // deno-lint-ignore no-explicit-any
    asserts.assertExists((envelope as any)?.response_metadata);
  });

  it('rejects an envelope missing ok', () => {
    asserts.assertExists(
      ErrorEnvelopeSchemaObject.safeParse({ error: 'invalid_auth' })[0],
    );
  });
});
