import * as asserts from '$asserts';
import { ErrorSchemaObject } from './Error.ts';

Deno.test('OpenExchange.schema.Error', async (t) => {
  await t.step('process error responses correctly', () => {
    // Test 401 - invalid_app_id
    asserts.assert(ErrorSchemaObject({
      'error': true,
      'status': 401,
      'message': 'invalid_app_id',
      'description':
        'Invalid App ID provided. Please sign up at https://openexchangerates.org/signup, or contact support@openexchangerates.org.',
    }));

    // Test 400 - missing_app_id
    asserts.assert(ErrorSchemaObject({
      'error': true,
      'status': 400,
      'message': 'missing_app_id',
      'description':
        'No App ID provided. Please sign up at https://openexchangerates.org/signup, or contact support@openexchangerates.org.',
    }));

    // Test 403 - not_allowed
    asserts.assert(ErrorSchemaObject({
      'error': true,
      'status': 403,
      'message': 'not_allowed',
      'description':
        'This feature is not allowed on your plan. Please upgrade your plan or contact support.',
    }));

    // Test 404 - not_found
    asserts.assert(ErrorSchemaObject({
      'error': true,
      'status': 404,
      'message': 'not_found',
      'description': 'The requested resource was not found.',
    }));

    // Test 429 - access_restricted
    asserts.assert(ErrorSchemaObject({
      'error': true,
      'status': 429,
      'message': 'access_restricted',
      'description':
        'Access restricted. Too many requests. Please wait and try again.',
    }));

    // Test invalid_base error
    asserts.assert(ErrorSchemaObject({
      'error': true,
      'status': 400,
      'message': 'invalid_base',
      'description':
        'Invalid base currency provided. Please use a valid 3-letter currency code.',
    }));
  });

  await t.step('invalid error schema', () => {
    // Invalid error field (should be true)
    asserts.assertThrows(() =>
      ErrorSchemaObject({
        'error': false,
        'status': 400,
        'message': 'invalid_app_id',
        'description':
          'Invalid App ID provided. Please sign up at https://openexchangerates.org/signup, or contact support@openexchangerates.org.',
      })
    );

    // Invalid message (not in allowed list)
    asserts.assertThrows(() =>
      ErrorSchemaObject({
        'error': true,
        'status': 400,
        'message': 'invalid_coded',
        'description':
          'Invalid App ID provided. Please sign up at https://openexchangerates.org/signup, or contact',
      })
    );

    // Invalid status code (not in allowed list)
    asserts.assertThrows(() =>
      ErrorSchemaObject({
        'error': true,
        'status': 500,
        'message': 'invalid_app_id',
        'description': 'Internal server error.',
      })
    );

    // Missing required fields
    asserts.assertThrows(() =>
      ErrorSchemaObject({
        'error': true,
        'status': 400,
        // missing message field
        'description': 'Invalid App ID provided.',
      })
    );

    // Invalid message type (number instead of string)
    asserts.assertThrows(() =>
      ErrorSchemaObject({
        'error': true,
        'status': 400,
        'message': 123,
        'description': 'Invalid App ID provided.',
      })
    );
  });
});
