import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ZonePageSchemaObject, ZoneSchemaObject } from './Zone.ts';

const zone = {
  id: '023e105f4ecef8ad9ca31a8372d0c353',
  name: 'example.com',
  status: 'active',
  paused: false,
  type: 'full',
  development_mode: 0,
  name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
  original_name_servers: null,
  account: { id: 'acct', name: 'Acme' },
  owner: { id: null, type: 'user' },
  plan: { id: 'free', name: 'Free Website' },
  meta: { step: 4 },
  created_on: '2026-01-01T00:00:00.000Z',
  modified_on: '2026-01-01T00:00:00.000Z',
  activated_on: null,
};

describe('CloudflareDNS.schema.Zone', () => {
  it('accepts a full zone with nulls where Cloudflare sends them', () => {
    const [error, value] = ZoneSchemaObject.safeParse(zone);
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.name_servers?.length, 2);
    asserts.assertEquals(value?.original_name_servers, null);
    asserts.assertEquals(value?.account?.name, 'Acme');
  });

  it('accepts the minimum id/name and keeps extra keys', () => {
    const [error, value] = ZoneSchemaObject.safeParse({
      id: 'z',
      name: 'n',
      verification_key: 'k',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (value as Record<string, unknown>).verification_key,
      'k',
    );
  });

  it('rejects a zone without a name or with a coerced paused flag', () => {
    asserts.assertExists(ZoneSchemaObject.safeParse({ id: 'z' })[0]);
    asserts.assertExists(
      ZoneSchemaObject.safeParse({ ...zone, paused: 'no' })[0],
    );
  });

  it('accepts a page of zones', () => {
    const [error, page] = ZonePageSchemaObject.safeParse({
      result: [zone],
      result_info: {
        page: 1,
        per_page: 20,
        count: 1,
        total_count: 1,
        total_pages: 1,
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.result[0]?.id, zone.id);
  });
});
