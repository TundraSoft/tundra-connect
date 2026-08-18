import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorSchemaObject } from './Error.ts';

describe('OpenWeatherMap.schema.Error', () => {
  it('parses a documented error envelope with a numeric cod', () => {
    const [error, envelope] = ErrorSchemaObject.safeParse({
      cod: 401,
      message:
        'Invalid API key. Please see https://openweathermap.org/faq#error401 for more info.',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.cod, 401);
    asserts.assertStringIncludes(envelope?.message ?? '', 'Invalid API key');
  });

  it('parses a documented error envelope with a string cod', () => {
    // The forecast endpoint (and, per the vendor docs, its error envelope)
    // echoes `cod` as a numeric string rather than a number — see
    // `codGuard` in `./Common.ts`.
    const [error, envelope] = ErrorSchemaObject.safeParse({
      cod: '404',
      message: 'city not found',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.cod, '404');
    asserts.assertEquals(typeof envelope?.cod, 'string');
  });

  it('parses an envelope missing message', () => {
    const [error, envelope] = ErrorSchemaObject.safeParse({ cod: 500 });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.cod, 500);
    asserts.assertEquals(envelope?.message, undefined);
  });

  it('parses an empty object, since both fields are optional', () => {
    const [error, envelope] = ErrorSchemaObject.safeParse({});
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.cod, undefined);
    asserts.assertEquals(envelope?.message, undefined);
  });

  it('rejects a malformed error body', () => {
    // `cod` accepts only a number or a string (see `codGuard` in
    // `./Common.ts`) — a boolean fails both branches.
    asserts.assertExists(
      ErrorSchemaObject.safeParse({ cod: true, message: 'oops' })[0],
    );
    // `message` is a plain string field; a non-string-coercible value
    // (a bare object, unlike a number/boolean) fails validation outright.
    asserts.assertExists(
      ErrorSchemaObject.safeParse({ cod: 500, message: {} })[0],
    );
  });

  it('rejects a non-object body', () => {
    asserts.assertExists(ErrorSchemaObject.safeParse('not an object')[0]);
    asserts.assertExists(ErrorSchemaObject.safeParse(null)[0]);
    asserts.assertExists(ErrorSchemaObject.safeParse(undefined)[0]);
  });
});
