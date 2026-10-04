import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorEnvelopeSchemaObject, ErrorItemSchemaObject } from './Error.ts';

describe('CloudflareDNS.schema.Error', () => {
  it('accepts an error item with a chain', () => {
    const [error, item] = ErrorItemSchemaObject.safeParse({
      code: 6003,
      message: 'Invalid request headers',
      error_chain: [{
        code: 6111,
        message: 'Invalid format for Authorization header',
      }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(item?.error_chain?.[0]?.code, 6111);
  });

  it('accepts a failure envelope and ignores result/messages', () => {
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      success: false,
      errors: [{ code: 81044, message: 'Record does not exist.' }],
      messages: [],
      result: null,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.success, false);
    asserts.assertEquals(envelope?.errors[0]?.code, 81044);
  });

  it('rejects a non-boolean success and a non-numeric code', () => {
    asserts.assertExists(
      ErrorEnvelopeSchemaObject.safeParse({ success: 'no', errors: [] })[0],
    );
    asserts.assertExists(
      ErrorItemSchemaObject.safeParse({ code: '81044', message: 'x' })[0],
    );
  });

  it('rejects a body that is not an envelope', () => {
    asserts.assertExists(ErrorEnvelopeSchemaObject.safeParse('<html>')[0]);
    asserts.assertExists(ErrorEnvelopeSchemaObject.safeParse({ ok: true })[0]);
  });
});
