import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DnsRecordPageSchemaObject,
  DnsRecordSchemaObject,
} from './DnsRecord.ts';

const record = {
  id: '372e67954025e0ba6aaa6d586b9e0b59',
  zone_id: '023e105f4ecef8ad9ca31a8372d0c353',
  zone_name: 'example.com',
  name: 'app.example.com',
  type: 'A',
  content: '203.0.113.10',
  proxiable: true,
  proxied: true,
  ttl: 1,
  comment: null,
  tags: [],
  settings: {},
  meta: {},
  created_on: '2026-10-04T12:00:00.000Z',
  modified_on: '2026-10-04T12:00:00.000Z',
};

describe('CloudflareDNS.schema.DnsRecord', () => {
  it('accepts a full A record with a null comment', () => {
    const [error, value] = DnsRecordSchemaObject.safeParse(record);
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.content, '203.0.113.10');
    asserts.assertEquals(value?.comment, null);
  });

  it('accepts a structured SRV record with data and priority', () => {
    const [error, value] = DnsRecordSchemaObject.safeParse({
      id: 'r1',
      name: '_sip._tcp.example.com',
      type: 'SRV',
      content: '10 5 5060 sip.example.com',
      data: { priority: 10, weight: 5, port: 5060, target: 'sip.example.com' },
      priority: 10,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.data?.port, 5060);
  });

  it('accepts the minimum id/name/type and an unknown future type', () => {
    asserts.assertEquals(
      DnsRecordSchemaObject.safeParse({
        id: 'r',
        name: 'n',
        type: 'NEWTYPE',
      })[0],
      null,
    );
  });

  it('keeps an additive vendor field', () => {
    const [error, value] = DnsRecordSchemaObject.safeParse({
      ...record,
      brand_new: 1,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals((value as Record<string, unknown>).brand_new, 1);
  });

  it('rejects a record without an id, or with a non-boolean proxied', () => {
    asserts.assertExists(
      DnsRecordSchemaObject.safeParse({ name: 'n', type: 'A' })[0],
    );
    asserts.assertExists(
      DnsRecordSchemaObject.safeParse({ ...record, proxied: 'yes' })[0],
    );
  });

  it('accepts a page with and without result_info', () => {
    const [error, page] = DnsRecordPageSchemaObject.safeParse({
      result: [record],
      result_info: {
        page: 1,
        per_page: 100,
        count: 1,
        total_count: 1,
        total_pages: 1,
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.result.length, 1);
    asserts.assertEquals(page?.result_info?.total_count, 1);
    asserts.assertEquals(
      DnsRecordPageSchemaObject.safeParse({ result: [] })[0],
      null,
    );
  });

  it('rejects a page whose result is not an array', () => {
    asserts.assertExists(
      DnsRecordPageSchemaObject.safeParse({ result: record })[0],
    );
  });
});
