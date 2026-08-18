import * as asserts from '@asserts';
import { describe, it } from '@test';
import { PutObjectResultSchemaObject } from './PutObjectResult.ts';

describe('AzureBlob.schema.response.PutObjectResult', () => {
  it('accepts etag + lastModified', () => {
    const [error, result] = PutObjectResultSchemaObject.safeParse({
      etag: '"0x8D1234567890ABC"',
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.etag, '"0x8D1234567890ABC"');
    asserts.assert(result?.lastModified instanceof Date);
  });

  it('rejects a missing etag', () => {
    const [error] = PutObjectResultSchemaObject.safeParse({
      lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
    });
    asserts.assertExists(error);
  });

  it('rejects a missing lastModified', () => {
    const [error] = PutObjectResultSchemaObject.safeParse({
      etag: '"abc"',
    });
    asserts.assertExists(error);
  });
});
