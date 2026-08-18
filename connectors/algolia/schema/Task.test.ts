import * as asserts from '@asserts';
import { describe, it } from '@test';
import { TaskStatusSchemaObject } from './Task.ts';

describe('Algolia.schema.Task', () => {
  it('accepts a published status', () => {
    const [error, value] = TaskStatusSchemaObject.safeParse({
      status: 'published',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.status, 'published');
  });

  it('accepts a notPublished status', () => {
    const [error, value] = TaskStatusSchemaObject.safeParse({
      status: 'notPublished',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.status, 'notPublished');
  });

  it('rejects an undocumented status value', () => {
    const [error, value] = TaskStatusSchemaObject.safeParse({
      status: 'pending',
    });
    asserts.assertExists(error);
    asserts.assertEquals(value, undefined);
  });
});
