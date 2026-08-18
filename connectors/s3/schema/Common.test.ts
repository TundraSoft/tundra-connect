import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  bucketGuard,
  etagGuard,
  keyGuard,
  metadataGuard,
  ObjectMetadataSchemaObject,
} from './Common.ts';

describe('S3.schema.Common', () => {
  it('bucketGuard rejects an empty bucket name', () => {
    const [error] = bucketGuard.safeParse('');
    asserts.assertExists(error);
  });

  it('bucketGuard accepts a non-empty bucket name', () => {
    const [error, value] = bucketGuard.safeParse('examplebucket');
    asserts.assertEquals(error, null);
    asserts.assertEquals(value, 'examplebucket');
  });

  it('keyGuard rejects an empty key', () => {
    const [error] = keyGuard.safeParse('');
    asserts.assertExists(error);
  });

  it('etagGuard accepts a quoted etag', () => {
    const [error, value] = etagGuard.safeParse(
      '"9a0364b9e99bb480dd25e1f0284c8555"',
    );
    asserts.assertEquals(error, null);
    asserts.assertEquals(value, '"9a0364b9e99bb480dd25e1f0284c8555"');
  });

  it('metadataGuard validates a string record', () => {
    const [error, value] = metadataGuard.safeParse({ owner: 'ada' });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value, { owner: 'ada' });
  });

  it('ObjectMetadataSchemaObject coerces header-derived values', () => {
    const [error, value] = ObjectMetadataSchemaObject.safeParse({
      contentType: 'text/plain',
      contentLength: '1234',
      etag: '"abc"',
      lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT',
      metadata: { owner: 'ada' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.contentLength, 1234);
    asserts.assertEquals(value?.lastModified instanceof Date, true);
  });

  it('ObjectMetadataSchemaObject allows every field to be absent', () => {
    const [error, value] = ObjectMetadataSchemaObject.safeParse({});
    asserts.assertEquals(error, null);
    asserts.assertEquals(value, {});
  });
});
