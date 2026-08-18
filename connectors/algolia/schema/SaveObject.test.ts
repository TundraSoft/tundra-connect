import * as asserts from '@asserts';
import { describe, it } from '@test';
import { SaveObjectResponseSchemaObject } from './SaveObject.ts';

describe('Algolia.schema.SaveObject', () => {
  it('accepts a documented save-object response', () => {
    const [error, value] = SaveObjectResponseSchemaObject.safeParse({
      objectID: 'abc123',
      taskID: 42,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.objectID, 'abc123');
    asserts.assertEquals(value?.taskID, 42);
  });

  it('rejects a response missing taskID', () => {
    const [error, value] = SaveObjectResponseSchemaObject.safeParse({
      objectID: 'abc123',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    asserts.assertExists(error);
    asserts.assertEquals(value, undefined);
  });

  it('rejects a non-integer taskID', () => {
    const [error, value] = SaveObjectResponseSchemaObject.safeParse({
      objectID: 'abc123',
      taskID: 42.5,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    asserts.assertExists(error);
    asserts.assertEquals(value, undefined);
  });
});
