import * as asserts from '@asserts';
import { describe, it } from '@test';
import { DeleteObjectResponseSchemaObject } from './DeleteObject.ts';

describe('S3.schema.DeleteObject', () => {
  it('accepts an empty result (no versioning headers)', () => {
    const [error, value] = DeleteObjectResponseSchemaObject.safeParse({});
    asserts.assertEquals(error, null);
    asserts.assertEquals(value, {});
  });

  it('coerces the delete-marker header value', () => {
    const [error, value] = DeleteObjectResponseSchemaObject.safeParse({
      versionId: 'v1',
      deleteMarker: 'true',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.deleteMarker, true);
  });
});
