import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ListZonesQuerySchemaObject } from './ListZonesQuery.ts';

describe('CloudflareDNS.schema.ListZonesQuery', () => {
  it('accepts every documented filter', () => {
    const [error, query] = ListZonesQuerySchemaObject.safeParse({
      name: 'example.com',
      status: 'active',
      match: 'all',
      page: 1,
      per_page: 50,
      order: 'name',
      direction: 'asc',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(query?.name, 'example.com');
  });

  it('accepts an empty query', () => {
    asserts.assertEquals(ListZonesQuerySchemaObject.safeParse({})[0], null);
  });

  it('rejects an empty name, a per_page outside 5..50, and bad enums', () => {
    asserts.assertExists(ListZonesQuerySchemaObject.safeParse({ name: '' })[0]);
    asserts.assertExists(
      ListZonesQuerySchemaObject.safeParse({ per_page: 4 })[0],
    );
    asserts.assertExists(
      ListZonesQuerySchemaObject.safeParse({ per_page: 51 })[0],
    );
    asserts.assertExists(
      ListZonesQuerySchemaObject.safeParse({ status: 'deleted' })[0],
    );
    asserts.assertExists(
      ListZonesQuerySchemaObject.safeParse({ order: 'id' })[0],
    );
  });
});
