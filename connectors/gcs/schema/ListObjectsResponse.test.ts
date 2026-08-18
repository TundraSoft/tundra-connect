import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ListObjectsResponseSchemaObject } from './ListObjectsResponse.ts';

describe('GCS.schema.ListObjectsResponse', () => {
  it('accepts a page of results', () => {
    const [error, parsed] = ListObjectsResponseSchemaObject.safeParse({
      kind: 'storage#objects',
      items: [{ name: 'a.txt', bucket: 'my-bucket' }],
      nextPageToken: 'CgJhLnR4dA==',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.items?.length, 1);
    asserts.assertEquals(parsed?.nextPageToken, 'CgJhLnR4dA==');
  });

  it('accepts a response with items omitted (no matches)', () => {
    const [error, parsed] = ListObjectsResponseSchemaObject.safeParse({
      kind: 'storage#objects',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.items, undefined);
  });

  it('accepts prefixes returned by a delimiter query', () => {
    const [error, parsed] = ListObjectsResponseSchemaObject.safeParse({
      kind: 'storage#objects',
      prefixes: ['logs/2024/', 'logs/2025/'],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(parsed?.prefixes?.length, 2);
  });

  it('rejects a malformed item in the items array', () => {
    const [error] = ListObjectsResponseSchemaObject.safeParse({
      items: [{ bucket: 'missing-name' }],
    });
    asserts.assertExists(error);
  });
});
