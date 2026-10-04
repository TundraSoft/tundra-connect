import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ListCustomHostnamesQuerySchemaObject,
  MAX_HOSTNAMES_PER_PAGE,
  MIN_HOSTNAMES_PER_PAGE,
} from './ListCustomHostnamesQuery.ts';

describe('CloudflareSaaS.schema.ListCustomHostnamesQuery', () => {
  it('accepts every documented filter', () => {
    const [error, query] = ListCustomHostnamesQuerySchemaObject.safeParse({
      hostname: 'app.customer.com',
      ssl_status: 'pending_validation',
      hostname_status: 'pending',
      certificate_authority: 'google',
      wildcard: false,
      custom_origin_server: 'origin.yourapp.com',
      page: 2,
      per_page: 50,
      order: 'ssl_status',
      direction: 'desc',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(query?.per_page, 50);
  });

  it('accepts an empty query and an id filter', () => {
    asserts.assertEquals(
      ListCustomHostnamesQuerySchemaObject.safeParse({})[0],
      null,
    );
    asserts.assertEquals(
      ListCustomHostnamesQuerySchemaObject.safeParse({ id: 'abc' })[0],
      null,
    );
  });

  it('rejects bad paging and enum values', () => {
    asserts.assertExists(
      ListCustomHostnamesQuerySchemaObject.safeParse({ page: 0 })[0],
    );
    asserts.assertExists(
      ListCustomHostnamesQuerySchemaObject.safeParse({
        per_page: MIN_HOSTNAMES_PER_PAGE - 1,
      })[0],
    );
    asserts.assertExists(
      ListCustomHostnamesQuerySchemaObject.safeParse({
        per_page: MAX_HOSTNAMES_PER_PAGE + 1,
      })[0],
    );
    asserts.assertExists(
      ListCustomHostnamesQuerySchemaObject.safeParse({ ssl_status: 'ok' })[0],
    );
    asserts.assertExists(
      ListCustomHostnamesQuerySchemaObject.safeParse({
        hostname_status: 'live',
      })[0],
    );
    asserts.assertExists(
      ListCustomHostnamesQuerySchemaObject.safeParse({ order: 'hostname' })[0],
    );
    asserts.assertExists(
      ListCustomHostnamesQuerySchemaObject.safeParse({ wildcard: 'yes' })[0],
    );
    asserts.assertExists(
      ListCustomHostnamesQuerySchemaObject.safeParse({ hostname: '' })[0],
    );
  });
});
