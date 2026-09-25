import * as asserts from '@asserts';
import { describe, it } from '@test';
import { GetObjectResultSchemaObject } from './GetObjectResult.ts';

describe('AzureBlob.schema.response.GetObjectResult', () => {
  it('accepts a fully-populated result', () => {
    const body = new Blob(['hello world']);
    const [error, result] = GetObjectResultSchemaObject.safeParse({
      body,
      contentType: 'text/plain',
      contentLength: '11',
      etag: '"0x8D1234567890ABC"',
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
      metadata: { author: 'ada' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.body, body);
    asserts.assertEquals(result?.contentLength, 11);
    asserts.assertEquals(result?.metadata.author, 'ada');
  });

  it('rejects a non-Blob body', () => {
    const [error] = GetObjectResultSchemaObject.safeParse({
      body: 'not a blob',
      etag: '"abc"',
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
      metadata: {},
    });
    asserts.assertExists(error);
  });

  it('accepts a missing contentType/contentLength', () => {
    const body = new Blob(['x']);
    const [error, result] = GetObjectResultSchemaObject.safeParse({
      body,
      etag: '"abc"',
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
      metadata: {},
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.contentType, undefined);
    asserts.assertEquals(result?.contentLength, undefined);
  });
});
