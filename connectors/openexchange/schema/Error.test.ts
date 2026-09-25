import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorSchemaObject } from './Error.ts';

describe('OpenExchange.schema.Error', () => {
  it('accepts documented vendor errors', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        error: true,
        status: 401,
        message: 'invalid_app_id',
        description: 'Invalid application ID.',
      })[0],
      null,
    );
  });

  it('accepts newer documented vendor error codes', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        error: true,
        status: 400,
        message: 'invalid_currency',
        description: 'Invalid currency code.',
      })[0],
      null,
    );
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        error: true,
        status: 400,
        message: 'invalid_amount',
        description: 'Invalid amount.',
      })[0],
      null,
    );
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        error: true,
        status: 400,
        message: 'invalid_date_range',
        description: 'Invalid date range.',
      })[0],
      null,
    );
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        error: true,
        status: 400,
        message: 'invalid_period_for_start_time',
        description: 'Invalid period for start time.',
      })[0],
      null,
    );
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        error: true,
        status: 400,
        message: 'invalid_start_time',
        description: 'Invalid start time.',
      })[0],
      null,
    );
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        error: true,
        status: 400,
        message: 'not_available',
        description: 'Requested data is not available.',
      })[0],
      null,
    );
  });

  it('rejects unknown vendor error codes', () => {
    asserts.assertExists(
      ErrorSchemaObject.safeParse({
        error: true,
        status: 500,
        message: 'unknown',
        description: 'Unknown error.',
      })[0],
    );
  });
});
