import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ListDnsRecordsQuerySchemaObject,
  MAX_RECORDS_PER_PAGE,
} from './ListDnsRecordsQuery.ts';

describe('CloudflareDNS.schema.ListDnsRecordsQuery', () => {
  it('accepts every documented filter', () => {
    const [error, query] = ListDnsRecordsQuerySchemaObject.safeParse({
      type: 'A',
      name: 'app.example.com',
      content: '203.0.113.10',
      proxied: true,
      match: 'all',
      comment: 'web',
      tag: 'env:prod',
      tag_match: 'any',
      search: 'app',
      page: 2,
      per_page: 50,
      order: 'name',
      direction: 'desc',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(query?.per_page, 50);
  });

  it('accepts an empty query', () => {
    asserts.assertEquals(
      ListDnsRecordsQuerySchemaObject.safeParse({})[0],
      null,
    );
  });

  it('rejects bad paging, ordering and enum values', () => {
    asserts.assertExists(
      ListDnsRecordsQuerySchemaObject.safeParse({ page: 0 })[0],
    );
    asserts.assertExists(
      ListDnsRecordsQuerySchemaObject.safeParse({ per_page: 0 })[0],
    );
    asserts.assertExists(
      ListDnsRecordsQuerySchemaObject.safeParse({
        per_page: MAX_RECORDS_PER_PAGE + 1,
      })[0],
    );
    asserts.assertExists(
      ListDnsRecordsQuerySchemaObject.safeParse({ order: 'id' })[0],
    );
    asserts.assertExists(
      ListDnsRecordsQuerySchemaObject.safeParse({ direction: 'up' })[0],
    );
    asserts.assertExists(
      ListDnsRecordsQuerySchemaObject.safeParse({ match: 'some' })[0],
    );
    asserts.assertExists(
      ListDnsRecordsQuerySchemaObject.safeParse({ type: 'SPF' })[0],
    );
    asserts.assertExists(
      ListDnsRecordsQuerySchemaObject.safeParse({ proxied: 'yes' })[0],
    );
  });
});
