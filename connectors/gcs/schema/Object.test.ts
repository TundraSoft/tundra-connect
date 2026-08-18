import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ObjectSchemaObject } from './Object.ts';

describe('GCS.schema.Object', () => {
  it('accepts a minimal Object resource', () => {
    const [error, parsed] = ObjectSchemaObject.safeParse({
      name: 'reports/2024-01.csv',
      bucket: 'my-bucket',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.name, 'reports/2024-01.csv');
    asserts.assertEquals(parsed?.bucket, 'my-bucket');
  });

  it('accepts a fully-populated Object resource', () => {
    const resource = {
      kind: 'storage#object',
      id: 'my-bucket/reports/2024-01.csv/1700000000000000',
      selfLink: 'https://storage.googleapis.com/storage/v1/b/my-bucket/o/x',
      mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/x',
      name: 'reports/2024-01.csv',
      bucket: 'my-bucket',
      generation: '1700000000000000',
      metageneration: '1',
      contentType: 'text/csv',
      size: '1024',
      md5Hash: 'XUFAKrxLKna5cZ2REBfFkg==',
      crc32c: 'AAAAAA==',
      etag: 'CJqk3aWk0YQDEAE=',
      timeCreated: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-01T00:00:00.000Z',
      storageClass: 'STANDARD',
      metadata: { source: 'nightly-job' },
    };
    const [error, parsed] = ObjectSchemaObject.safeParse(resource);
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.size, '1024');
    asserts.assertEquals(parsed?.metadata?.source, 'nightly-job');
  });

  it('passes through undocumented vendor fields', () => {
    const [error, parsed] = ObjectSchemaObject.safeParse({
      name: 'a.txt',
      bucket: 'b',
      owner: { entity: 'user-owner@example.com' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (parsed as unknown as { owner: { entity: string } }).owner.entity,
      'user-owner@example.com',
    );
  });

  it('rejects a resource missing the required name/bucket', () => {
    const [error] = ObjectSchemaObject.safeParse({ bucket: 'b' });
    asserts.assertExists(error);
  });
});
