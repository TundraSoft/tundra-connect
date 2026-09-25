import * as asserts from '@asserts';
import { describe, it } from '@test';
import { BlobPropertiesSchemaObject } from './BlobProperties.ts';

describe('AzureBlob.schema.common.BlobProperties', () => {
  it('accepts a fully-populated header set', () => {
    const [error, props] = BlobPropertiesSchemaObject.safeParse({
      etag: '"0x8D1234567890ABC"',
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
      contentType: 'text/plain',
      contentLength: '11',
      metadata: { author: 'ada' },
    });
    asserts.assertEquals(error, null);
    asserts.assert(props?.lastModified instanceof Date);
    asserts.assertEquals(props?.contentLength, 11);
    asserts.assertEquals(props?.metadata.author, 'ada');
  });

  it('accepts missing contentType/contentLength and empty metadata', () => {
    const [error, props] = BlobPropertiesSchemaObject.safeParse({
      etag: '"abc"',
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
      metadata: {},
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(props?.contentType, undefined);
    asserts.assertEquals(props?.contentLength, undefined);
    asserts.assertEquals(props?.metadata, {});
  });

  it('rejects a missing etag', () => {
    const [error] = BlobPropertiesSchemaObject.safeParse({
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
      metadata: {},
    });
    asserts.assertExists(error);
  });
});
