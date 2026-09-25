import * as asserts from '@asserts';
import { describe, it } from '@test';
import { BlobItemSchemaObject } from './BlobItem.ts';

describe('AzureBlob.schema.common.BlobItem', () => {
  it('accepts a fully-populated item and coerces lastModified/contentLength', () => {
    const [error, item] = BlobItemSchemaObject.safeParse({
      name: 'photos/cat.png',
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
      etag: '"0x8D1234567890ABC"',
      contentLength: '12345',
      contentType: 'image/png',
    });
    asserts.assertEquals(error, null);
    asserts.assert(item?.lastModified instanceof Date);
    asserts.assertEquals(item?.contentLength, 12345);
    asserts.assertEquals(item?.contentType, 'image/png');
  });

  it('accepts a missing contentType', () => {
    const [error, item] = BlobItemSchemaObject.safeParse({
      name: 'blob.txt',
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
      etag: '"abc"',
      contentLength: '0',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(item?.contentType, undefined);
  });

  it('rejects a missing name', () => {
    const [error] = BlobItemSchemaObject.safeParse({
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
      etag: '"abc"',
      contentLength: '0',
    });
    asserts.assertExists(error);
  });

  it('rejects an unparseable lastModified', () => {
    const [error] = BlobItemSchemaObject.safeParse({
      name: 'blob.txt',
      lastModified: 'not-a-date',
      etag: '"abc"',
      contentLength: '0',
    });
    asserts.assertExists(error);
  });
});
