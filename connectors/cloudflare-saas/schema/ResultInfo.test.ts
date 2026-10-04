import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ResultInfoSchemaObject } from './ResultInfo.ts';

describe('CloudflareSaaS.schema.ResultInfo', () => {
  it('accepts a full paging block and an empty one', () => {
    asserts.assertEquals(
      ResultInfoSchemaObject.safeParse({
        page: 1,
        per_page: 20,
        count: 3,
        total_count: 3,
        total_pages: 1,
      })[0],
      null,
    );
    asserts.assertEquals(ResultInfoSchemaObject.safeParse({})[0], null);
  });

  it('rejects a non-numeric count', () => {
    asserts.assertExists(
      ResultInfoSchemaObject.safeParse({ count: 'many' })[0],
    );
  });
});
