import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DNS_RECORD_TYPES,
  DnsRecordTypeSchemaObject,
} from './DnsRecordType.ts';

describe('CloudflareDNS.schema.DnsRecordType', () => {
  it('accepts every documented type', () => {
    for (const type of DNS_RECORD_TYPES) {
      asserts.assertEquals(
        DnsRecordTypeSchemaObject.safeParse(type)[0],
        null,
        type,
      );
    }
    asserts.assertEquals(DNS_RECORD_TYPES.length, 21);
  });

  it('rejects an unknown or lower-case type', () => {
    asserts.assertExists(DnsRecordTypeSchemaObject.safeParse('SPF')[0]);
    asserts.assertExists(DnsRecordTypeSchemaObject.safeParse('a')[0]);
    asserts.assertExists(DnsRecordTypeSchemaObject.safeParse(1)[0]);
  });
});
