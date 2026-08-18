import * as asserts from '@asserts';
import { describe, it } from '@test';
import { DeleteObjectResponseSchemaObject } from './DeleteObject.ts';

describe('Algolia.schema.DeleteObject', () => {
  it('accepts a documented delete-object response', () => {
    const [error, value] = DeleteObjectResponseSchemaObject.safeParse({
      deletedAt: '2024-01-01T00:00:00.000Z',
      taskID: 43,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.taskID, 43);
  });

  it('rejects a response missing deletedAt', () => {
    const [error, value] = DeleteObjectResponseSchemaObject.safeParse({
      taskID: 43,
    });
    asserts.assertExists(error);
    asserts.assertEquals(value, undefined);
  });
});
