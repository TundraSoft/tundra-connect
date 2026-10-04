import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ResultInfoSchemaObject } from './ResultInfo.ts';

describe('CloudflareDNS.schema.ResultInfo', () => {
  it('accepts a full paging block', () => {
    const [error, info] = ResultInfoSchemaObject.safeParse({
      page: 2,
      per_page: 100,
      count: 100,
      total_count: 250,
      total_pages: 3,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(info?.total_pages, 3);
  });

  it('accepts an empty block and keeps extra keys', () => {
    const [error, info] = ResultInfoSchemaObject.safeParse({ cursor: 'abc' });
    asserts.assertEquals(error, null);
    asserts.assertEquals((info as Record<string, unknown>).cursor, 'abc');
  });

  it('rejects a non-numeric count', () => {
    asserts.assertExists(
      ResultInfoSchemaObject.safeParse({ count: 'many' })[0],
    );
  });
});
