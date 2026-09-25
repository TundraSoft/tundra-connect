import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorSchemaObject } from './Error.ts';

describe('Twilio.schema.Error', () => {
  it('accepts a fully-populated error envelope', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        code: 21211,
        message: "The 'To' number is not a valid phone number.",
        more_info: 'https://www.twilio.com/docs/errors/21211',
        status: 400,
      })[0],
      null,
    );
  });

  it('accepts an error envelope without optional fields', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        message: 'Internal server error',
        status: 500,
      })[0],
      null,
    );
  });

  it('rejects an envelope missing the required message', () => {
    asserts.assertExists(
      ErrorSchemaObject.safeParse({ status: 400 })[0],
    );
  });

  it('rejects an envelope missing the required status', () => {
    asserts.assertExists(
      ErrorSchemaObject.safeParse({ message: 'oops' })[0],
    );
  });
});
