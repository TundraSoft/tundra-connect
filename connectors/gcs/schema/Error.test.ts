import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorEnvelopeSchemaObject } from './Error.ts';

describe('GCS.schema.Error', () => {
  it('accepts a documented error envelope with one detail entry', () => {
    const body = {
      error: {
        code: 404,
        message: 'Not Found',
        errors: [
          {
            domain: 'global',
            reason: 'notFound',
            message: 'Not Found',
          },
        ],
      },
    };
    const [error, parsed] = ErrorEnvelopeSchemaObject.safeParse(body);
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.error.code, 404);
    asserts.assertEquals(parsed?.error.errors?.[0]?.reason, 'notFound');
  });

  it('accepts an envelope with multiple error detail entries', () => {
    const body = {
      error: {
        code: 400,
        message: 'Bad Request',
        errors: [
          { reason: 'required', message: 'name is required' },
          { reason: 'invalid', message: 'name is invalid' },
        ],
      },
    };
    const [error, parsed] = ErrorEnvelopeSchemaObject.safeParse(body);
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.error.errors?.length, 2);
  });

  it('accepts an envelope missing the optional errors array', () => {
    const [error, parsed] = ErrorEnvelopeSchemaObject.safeParse({
      error: { code: 500, message: 'Internal Error' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.error.errors, undefined);
  });

  it('rejects a body missing the error envelope', () => {
    const [error] = ErrorEnvelopeSchemaObject.safeParse({ ok: true });
    asserts.assertExists(error);
  });
});
