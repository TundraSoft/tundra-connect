import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorEnvelopeSchemaObject, ErrorItemSchemaObject } from './Error.ts';

describe('CloudflareEmail.schema.ErrorItem', () => {
  it('accepts a documented error item', () => {
    const [error, item] = ErrorItemSchemaObject.safeParse({
      code: 10001,
      message: 'email.sending.error.invalid_request_schema',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(item?.code, 10001);
  });

  it('rejects an item missing its code', () => {
    asserts.assertExists(ErrorItemSchemaObject.safeParse({ message: 'x' })[0]);
  });

  it('rejects a non-object item', () => {
    asserts.assertExists(ErrorItemSchemaObject.safeParse('10001')[0]);
  });
});

describe('CloudflareEmail.schema.ErrorEnvelope', () => {
  it('accepts a documented failure envelope', () => {
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      success: false,
      errors: [{ code: 10101, message: 'email.sending.error.unauthorized' }],
      messages: [],
      result: null,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.success, false);
    asserts.assertEquals(envelope?.errors[0]?.code, 10101);
  });

  it('accepts a success envelope — the shape is shared, only `success` differs', () => {
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      success: true,
      errors: [],
      messages: [],
      result: { delivered: [] },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.success, true);
  });

  it('rejects a body with no errors array — the gateway-HTML case', () => {
    asserts.assertExists(
      ErrorEnvelopeSchemaObject.safeParse({ success: false })[0],
    );
  });

  it('rejects a non-envelope body', () => {
    asserts.assertExists(
      ErrorEnvelopeSchemaObject.safeParse('<html>502</html>')[0],
    );
  });
});
