import * as asserts from '@asserts';
import { describe, it } from '@test';
import { HeadObjectResultSchemaObject } from './HeadObjectResult.ts';

describe('AzureBlob.schema.response.HeadObjectResult', () => {
  it('accepts a fully-populated result', () => {
    const [error, result] = HeadObjectResultSchemaObject.safeParse({
      contentType: 'text/plain',
      contentLength: '11',
      etag: '"0x8D1234567890ABC"',
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
      metadata: { author: 'ada' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.contentLength, 11);
    asserts.assertEquals(result?.metadata.author, 'ada');
  });

  it('rejects a missing etag', () => {
    const [error] = HeadObjectResultSchemaObject.safeParse({
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
      metadata: {},
    });
    asserts.assertExists(error);
  });
});
