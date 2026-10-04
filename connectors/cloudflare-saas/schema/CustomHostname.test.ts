import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CUSTOM_HOSTNAME_STATUSES,
  CustomHostnamePageSchemaObject,
  CustomHostnameSchemaObject,
} from './CustomHostname.ts';

const pending = {
  id: '0d89c70d-ad9f-4843-b99f-6cc0252067e9',
  hostname: 'app.customer.com',
  status: 'pending',
  ssl: {
    id: 'ssl-1',
    type: 'dv',
    method: 'txt',
    status: 'pending_validation',
    validation_records: [{
      txt_name: '_acme-challenge.app.customer.com',
      txt_value: 'abc',
    }],
  },
  custom_metadata: { tenant: 'acme', tier: null },
  custom_origin_server: null,
  custom_origin_sni: null,
  ownership_verification: {
    type: 'txt',
    name: '_cf-custom-hostname.app.customer.com',
    value: '5cc07c04-ea62-4a5a-95f0-419334a875a4',
  },
  ownership_verification_http: {
    http_url:
      'http://app.customer.com/.well-known/cf-custom-hostname-challenge/0d89c70d',
    http_body: '5cc07c04-ea62-4a5a-95f0-419334a875a4',
  },
  verification_errors: [],
  created_at: '2026-10-04T12:00:00.000Z',
};

describe('CloudflareSaaS.schema.CustomHostname', () => {
  it('accepts a pending hostname with every block', () => {
    const [error, h] = CustomHostnameSchemaObject.safeParse(pending);
    asserts.assertEquals(error, null);
    asserts.assertEquals(h?.ssl?.method, 'txt');
    asserts.assertEquals(
      h?.ownership_verification?.value,
      pending.ownership_verification.value,
    );
    asserts.assertEquals(h?.custom_metadata?.tenant, 'acme');
    asserts.assertEquals(h?.custom_origin_server, null);
  });

  it('accepts a hostname with ssl: null and the minimum id/hostname', () => {
    asserts.assertEquals(
      CustomHostnameSchemaObject.safeParse({
        id: 'x',
        hostname: 'h.example',
        ssl: null,
      })[0],
      null,
    );
    asserts.assertEquals(
      CustomHostnameSchemaObject.safeParse({
        id: 'x',
        hostname: 'h.example',
      })[0],
      null,
    );
  });

  it('keeps an undocumented status and additive fields', () => {
    const [error, h] = CustomHostnameSchemaObject.safeParse({
      ...pending,
      status: 'brand_new',
      brand_new: 1,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(h?.status, 'brand_new');
    asserts.assertEquals((h as Record<string, unknown>).brand_new, 1);
  });

  it('rejects a hostname without an id or with a malformed ssl block', () => {
    asserts.assertExists(
      CustomHostnameSchemaObject.safeParse({ hostname: 'h' })[0],
    );
    asserts.assertExists(
      CustomHostnameSchemaObject.safeParse({
        id: 'x',
        hostname: 'h',
        ssl: 'active',
      })[0],
    );
    asserts.assertExists(
      CustomHostnameSchemaObject.safeParse({
        id: 'x',
        hostname: 'h',
        verification_errors: 'none',
      })[0],
    );
  });

  it('accepts a page with and without result_info', () => {
    const [error, page] = CustomHostnamePageSchemaObject.safeParse({
      result: [pending],
      result_info: {
        page: 1,
        per_page: 20,
        count: 1,
        total_count: 1,
        total_pages: 1,
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.result[0]?.hostname, 'app.customer.com');
    asserts.assertEquals(
      CustomHostnamePageSchemaObject.safeParse({ result: [] })[0],
      null,
    );
    asserts.assertExists(
      CustomHostnamePageSchemaObject.safeParse({ result: pending })[0],
    );
  });

  it('documents the status list', () => {
    asserts.assert(CUSTOM_HOSTNAME_STATUSES.includes('pending'));
    asserts.assert(CUSTOM_HOSTNAME_STATUSES.includes('active'));
    asserts.assertEquals(CUSTOM_HOSTNAME_STATUSES.length, 16);
  });
});
