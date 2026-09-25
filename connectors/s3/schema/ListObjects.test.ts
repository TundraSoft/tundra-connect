import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ListObjectsResponseSchemaObject,
  S3ObjectSchemaObject,
} from './ListObjects.ts';

describe('S3.schema.ListObjects', () => {
  it('S3ObjectSchemaObject maps a Contents entry to a camelCase shape', () => {
    const [error, value] = S3ObjectSchemaObject.safeParse({
      Key: 'photos/2019/vacation.jpg',
      LastModified: '2019-06-01T12:00:00.000Z',
      ETag: '"9a0364b9e99bb480dd25e1f0284c8555"',
      Size: '2048',
      StorageClass: 'STANDARD',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.key, 'photos/2019/vacation.jpg');
    asserts.assertEquals(value?.size, 2048);
    asserts.assertEquals(value?.storageClass, 'STANDARD');
  });

  it('normalizes a single (non-array) Contents element to a one-item array', () => {
    // The bundled XML parser returns a bare object, not a one-element
    // array, when only one <Contents> element is present — this is the
    // real, empirically-verified shape, not a hypothetical.
    const [error, value] = ListObjectsResponseSchemaObject.safeParse({
      Name: 'examplebucket',
      Prefix: null,
      KeyCount: '1',
      MaxKeys: '1000',
      IsTruncated: 'false',
      Contents: {
        Key: 'a.txt',
        LastModified: '2023-01-01T00:00:00.000Z',
        ETag: '"abc"',
        Size: '1234',
        StorageClass: 'STANDARD',
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.contents.length, 1);
    asserts.assertEquals(value?.contents[0]?.key, 'a.txt');
    asserts.assertEquals(value?.prefix, undefined);
    asserts.assertEquals(value?.isTruncated, false);
  });

  it('keeps a multi-element Contents array as-is', () => {
    const [error, value] = ListObjectsResponseSchemaObject.safeParse({
      Name: 'examplebucket',
      IsTruncated: 'true',
      NextContinuationToken: 'abc123',
      Contents: [
        {
          Key: 'a.txt',
          LastModified: '2023-01-01T00:00:00.000Z',
          ETag: '"abc"',
          Size: '1234',
        },
        {
          Key: 'b.txt',
          LastModified: '2023-01-02T00:00:00.000Z',
          ETag: '"def"',
          Size: '5678',
        },
      ],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.contents.length, 2);
    asserts.assertEquals(value?.isTruncated, true);
    asserts.assertEquals(value?.nextContinuationToken, 'abc123');
  });

  it('normalizes a missing Contents element to an empty array (empty bucket/prefix)', () => {
    const [error, value] = ListObjectsResponseSchemaObject.safeParse({
      Name: 'emptybucket',
      IsTruncated: 'false',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.contents, []);
  });
});
