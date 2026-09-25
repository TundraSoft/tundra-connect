import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorSchemaObject } from './Error.ts';

describe('AzureBlob.schema.common.Error', () => {
  it('accepts the documented <Error> envelope shape', () => {
    const [error, parsed] = ErrorSchemaObject.safeParse({
      Error: {
        Code: 'BlobNotFound',
        Message:
          'The specified blob does not exist.\nRequestId:abc123\nTime:2026-08-16T00:00:00.0000000Z',
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.Error.Code, 'BlobNotFound');
    asserts.assertStringIncludes(
      parsed?.Error.Message ?? '',
      'The specified blob does not exist.',
    );
  });

  it('rejects a payload missing the Error envelope', () => {
    const [error] = ErrorSchemaObject.safeParse({ foo: 'bar' });
    asserts.assertExists(error);
  });

  it('rejects an Error envelope missing Code or Message', () => {
    const [error] = ErrorSchemaObject.safeParse({
      Error: { Code: 'BlobNotFound' },
    });
    asserts.assertExists(error);
  });
});
