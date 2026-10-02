import * as asserts from '@asserts';
import { describe, it } from '@test';
import { TagEntrySchemaObject, TagUrlSchemaObject } from './Tag.ts';

describe('URLhaus.schema.Tag', () => {
  it('parses a tag entry', () => {
    const [error, tag] = TagEntrySchemaObject.safeParse({
      firstseen: '2019-01-01 00:00:00 UTC',
      lastseen: null,
      url_count: '2',
      urls: [{ url_id: '1', dateadded: '2019-01-01 00:00:00 UTC' }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(tag?.urls?.[0]?.dateadded, '2019-01-01 00:00:00 UTC');
  });

  it('rejects a urls value that is not an array', () => {
    asserts.assertExists(TagEntrySchemaObject.safeParse({ urls: 'x' })[0]);
  });

  it('accepts an empty tag URL', () => {
    asserts.assertEquals(TagUrlSchemaObject.safeParse({})[0], null);
  });
});
