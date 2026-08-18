import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorSchemaObject } from './Error.ts';

describe('Ntfy.schema.Error', () => {
  it('accepts a documented error envelope', () => {
    const [error, envelope] = ErrorSchemaObject.safeParse({
      code: 40101,
      http: 401,
      error: 'unauthorized',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.http, 401);
    asserts.assertEquals(envelope?.error, 'unauthorized');
  });

  it('accepts an envelope carrying a docs link', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({
        code: 40001,
        http: 400,
        error: 'invalid request: topic invalid',
        link: 'https://ntfy.sh/docs/publish/',
      })[0],
      null,
    );
  });

  it('accepts an envelope without the optional code', () => {
    asserts.assertEquals(
      ErrorSchemaObject.safeParse({ http: 500, error: 'internal error' })[0],
      null,
    );
  });

  it('rejects an envelope missing `http`', () => {
    asserts.assertExists(
      ErrorSchemaObject.safeParse({ error: 'unauthorized' })[0],
    );
  });

  it('rejects an envelope missing `error`', () => {
    asserts.assertExists(
      ErrorSchemaObject.safeParse({ http: 401 })[0],
    );
  });

  it('rejects a non-numeric `http`', () => {
    asserts.assertExists(
      ErrorSchemaObject.safeParse({ http: 'unauthorized', error: 'nope' })[0],
    );
  });
});
