import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorEnvelopeSchemaObject } from './Error.ts';

describe('PayPal.schema.Error', () => {
  it('accepts a documented 422 error envelope with details', () => {
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      name: 'UNPROCESSABLE_ENTITY',
      details: [
        {
          field: "/purchase_units/@reference_id=='PUHF'/shipping/address",
          issue: 'MISSING_SHIPPING_ADDRESS',
          description:
            'The shipping address is required when shipping_preference=SET_PROVIDED_ADDRESS.',
        },
      ],
      message:
        'The requested action could not be performed, semantically incorrect, or failed business validation.',
      debug_id: 'f200264a4e02a',
      links: [
        {
          href:
            'https://developer.paypal.com/api/rest/reference/orders/v2/errors/#MISSING_SHIPPING_ADDRESS',
          rel: 'information_link',
          method: 'GET',
        },
      ],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      envelope?.details?.[0]?.issue,
      'MISSING_SHIPPING_ADDRESS',
    );
  });

  it('accepts an envelope with no details/links', () => {
    const [error, envelope] = ErrorEnvelopeSchemaObject.safeParse({
      name: 'INVALID_REQUEST',
      message:
        'Request is not well-formed, syntactically incorrect, or violates schema.',
      debug_id: 'abc123',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.details, undefined);
  });

  it('rejects an envelope missing required fields', () => {
    asserts.assertExists(
      ErrorEnvelopeSchemaObject.safeParse({ message: 'oops' })[0],
    );
    asserts.assertExists(
      ErrorEnvelopeSchemaObject.safeParse({ name: 'X', message: 'oops' })[0],
    );
  });

  it('rejects a non-object payload', () => {
    asserts.assertExists(ErrorEnvelopeSchemaObject.safeParse('oops')[0]);
    asserts.assertExists(ErrorEnvelopeSchemaObject.safeParse(null)[0]);
  });
});
