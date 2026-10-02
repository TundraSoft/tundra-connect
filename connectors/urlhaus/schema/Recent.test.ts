import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  RecentPayloadsSchemaObject,
  RecentUrlSchemaObject,
  RecentUrlsSchemaObject,
} from './Recent.ts';

describe('URLhaus.schema.Recent', () => {
  it('parses the recent-URLs feed', () => {
    const [error, feed] = RecentUrlsSchemaObject.safeParse({
      query_status: 'ok',
      urls: [{
        id: '223622',
        url: 'http://45.61.49.78/razor/r4z0r.mips',
        larted: 'true',
        tags: ['elf'],
      }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(feed?.urls?.[0]?.tags, ['elf']);
  });

  it('parses the recent-payloads feed', () => {
    const [error, feed] = RecentPayloadsSchemaObject.safeParse({
      payloads: [{ sha256_hash: 'abc', file_size: '1' }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(feed?.payloads?.[0]?.file_size, '1');
  });

  it('rejects a urls value that is not an array', () => {
    asserts.assertExists(RecentUrlsSchemaObject.safeParse({ urls: 'x' })[0]);
  });

  it('accepts a recent URL with null tags', () => {
    asserts.assertEquals(
      RecentUrlSchemaObject.safeParse({ tags: null })[0],
      null,
    );
  });
});
