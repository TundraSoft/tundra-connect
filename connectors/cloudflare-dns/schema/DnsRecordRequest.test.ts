import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DnsRecordPatchSchemaObject,
  DnsRecordRequestSchemaObject,
} from './DnsRecordRequest.ts';

describe('CloudflareDNS.schema.DnsRecordRequest', () => {
  it('accepts a simple A record with every optional field', () => {
    const [error, value] = DnsRecordRequestSchemaObject.safeParse({
      type: 'A',
      name: 'app.example.com',
      content: '203.0.113.10',
      ttl: 300,
      proxied: true,
      comment: 'web',
      tags: ['env:prod'],
      settings: { ipv4_only: false },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.ttl, 300);
  });

  it('accepts a data-only SRV record and an MX priority', () => {
    asserts.assertEquals(
      DnsRecordRequestSchemaObject.safeParse({
        type: 'SRV',
        name: '_sip._tcp.example.com',
        data: {
          priority: 10,
          weight: 5,
          port: 5060,
          target: 'sip.example.com',
        },
      })[0],
      null,
    );
    asserts.assertEquals(
      DnsRecordRequestSchemaObject.safeParse({
        type: 'MX',
        name: 'example.com',
        content: 'mail.example.com',
        priority: 10,
      })[0],
      null,
    );
  });

  it('accepts ttl 1 (automatic) and the 30..86400 range, rejects the rest', () => {
    for (const ttl of [1, 30, 60, 86400]) {
      asserts.assertEquals(
        DnsRecordRequestSchemaObject.safeParse({
          type: 'A',
          name: 'n',
          content: 'c',
          ttl,
        })[0],
        null,
        String(ttl),
      );
    }
    for (const ttl of [0, 2, 29, 86401, 60.5, -1]) {
      asserts.assertExists(
        DnsRecordRequestSchemaObject.safeParse({
          type: 'A',
          name: 'n',
          content: 'c',
          ttl,
        })[0],
        String(ttl),
      );
    }
  });

  it('rejects a missing or unknown type, an empty name, an over-long name', () => {
    asserts.assertExists(
      DnsRecordRequestSchemaObject.safeParse({ name: 'n', content: 'c' })[0],
    );
    asserts.assertExists(
      DnsRecordRequestSchemaObject.safeParse({
        type: 'SPF',
        name: 'n',
        content: 'c',
      })[0],
    );
    asserts.assertExists(
      DnsRecordRequestSchemaObject.safeParse({
        type: 'A',
        name: '',
        content: 'c',
      })[0],
    );
    asserts.assertExists(
      DnsRecordRequestSchemaObject.safeParse({
        type: 'A',
        name: 'x'.repeat(256),
        content: 'c',
      })[0],
    );
  });

  it('rejects a priority out of range and a coerced proxied', () => {
    asserts.assertExists(
      DnsRecordRequestSchemaObject.safeParse({
        type: 'MX',
        name: 'n',
        content: 'c',
        priority: 70000,
      })[0],
    );
    asserts.assertExists(
      DnsRecordRequestSchemaObject.safeParse({
        type: 'A',
        name: 'n',
        content: 'c',
        proxied: 'true',
      })[0],
    );
  });

  it('patch: every field is optional, but the same rules apply', () => {
    asserts.assertEquals(DnsRecordPatchSchemaObject.safeParse({})[0], null);
    asserts.assertEquals(
      DnsRecordPatchSchemaObject.safeParse({
        content: '203.0.113.11',
        comment: '',
      })[0],
      null,
    );
    asserts.assertExists(DnsRecordPatchSchemaObject.safeParse({ ttl: 5 })[0]);
    asserts.assertExists(
      DnsRecordPatchSchemaObject.safeParse({ type: 'NOPE' })[0],
    );
  });
});
