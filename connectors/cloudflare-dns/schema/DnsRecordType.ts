import { type BaseGuardian, Guardian } from '@guardian';

/** Every DNS record type Cloudflare's API accepts. */
export const DNS_RECORD_TYPES = [
  'A',
  'AAAA',
  'CAA',
  'CERT',
  'CNAME',
  'DNSKEY',
  'DS',
  'HTTPS',
  'LOC',
  'MX',
  'NAPTR',
  'NS',
  'OPENPGPKEY',
  'PTR',
  'SMIMEA',
  'SRV',
  'SSHFP',
  'SVCB',
  'TLSA',
  'TXT',
  'URI',
] as const;

/** Type definition for {@link DnsRecordTypeSchemaObject}. */
export type DnsRecordTypeSchema = typeof DNS_RECORD_TYPES[number];

/**
 * Schema for a DNS record type, as sent in a request. Responses keep the
 * type as a plain string so a type Cloudflare adds later never fails a read.
 *
 * @example
 * ```typescript
 * import { DnsRecordTypeSchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * const [error, type] = DnsRecordTypeSchemaObject.safeParse('TXT');
 * ```
 */
export const DnsRecordTypeSchemaObject: BaseGuardian<DnsRecordTypeSchema> =
  Guardian.enum(DNS_RECORD_TYPES).describe({
    title: 'DNS record type',
    description: 'One of the record types Cloudflare DNS accepts.',
  });
