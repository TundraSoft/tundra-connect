import * as asserts from '@asserts';
import { describe, it } from '@test';
import { PutObjectResponseSchemaObject } from './PutObject.ts';

describe('S3.schema.PutObject', () => {
  it('accepts an etag-only result', () => {
    const [error, value] = PutObjectResponseSchemaObject.safeParse({
      etag: '"9a0364b9e99bb480dd25e1f0284c8555"',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.etag, '"9a0364b9e99bb480dd25e1f0284c8555"');
  });

  it('accepts an optional versionId', () => {
    const [error, value] = PutObjectResponseSchemaObject.safeParse({
      etag: '"abc"',
      versionId: 'v1',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.versionId, 'v1');
  });

  it('rejects a result missing the required etag', () => {
    const [error] = PutObjectResponseSchemaObject.safeParse({});
    asserts.assertExists(error);
  });
});
