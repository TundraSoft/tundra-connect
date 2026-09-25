import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorItemSchemaObject, ErrorSchemaObject } from './Error.ts';

describe('SendGrid.schema.Error', () => {
  it('accepts a documented error envelope', () => {
    const [error, envelope] = ErrorSchemaObject.safeParse({
      errors: [
        {
          message: 'The from email does not contain a valid address.',
          field: 'from.email',
        },
      ],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.errors[0]?.field, 'from.email');
  });

  it('accepts a null field and an id', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        errors: [{ message: 'Unauthorized', field: null }],
        id: 'req-123',
      })[0],
      null,
    );
  });

  it('accepts an error item carrying a help payload', () => {
    asserts.assertEquals(
      ErrorItemSchemaObject.safeParse({
        message: 'Maximum categories exceeded',
        field: 'categories',
        help: { docs: 'https://docs.sendgrid.com/categories' },
      })[0],
      null,
    );
  });

  it('rejects an error item missing `field`', () => {
    asserts.assertExists(
      ErrorItemSchemaObject.safeParse({ message: 'Unauthorized' })[0],
    );
  });

  it('rejects an envelope missing `errors`', () => {
    asserts.assertExists(ErrorSchemaObject.safeParse({ id: 'req-123' })[0]);
  });

  it('rejects a non-array `errors` field', () => {
    asserts.assertExists(
      ErrorSchemaObject.safeParse({ errors: 'Unauthorized' })[0],
    );
  });
});
