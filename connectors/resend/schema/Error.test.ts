import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorResponseSchemaObject } from './Error.ts';

describe('Resend.schema.Error', () => {
  it("accepts Resend's error body", () => {
    const [error, value] = ErrorResponseSchemaObject.safeParse({
      statusCode: 422,
      name: 'missing_required_field',
      message: 'Missing `to` field.',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.name, 'missing_required_field');
  });

  it('accepts a body without statusCode', () => {
    const [error] = ErrorResponseSchemaObject.safeParse({
      name: 'not_found',
      message: 'Email not found',
    });
    asserts.assertEquals(error, null);
  });

  it('rejects a body without a name', () => {
    const [error] = ErrorResponseSchemaObject.safeParse({ message: 'x' });
    asserts.assertExists(error);
  });

  it('rejects a non-object body', () => {
    asserts.assertExists(ErrorResponseSchemaObject.safeParse('<html>')[0]);
  });
});
