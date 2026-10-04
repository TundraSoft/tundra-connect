/**
 * Guardian schemas behind `@tundraconnect/cloudflare-dns`: every request and
 * response shape the client validates, each exported as a schema object with
 * its TypeScript type. Use them to validate a payload you stored or received
 * elsewhere, or to type your own code against the client's shapes.
 *
 * @example
 * ```ts
 * import { DnsRecordSchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded record
 * const [error, record] = DnsRecordSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(record.name, record.type, record.content);
 * ```
 *
 * @module
 */

export {
  type DnsRecordPageSchema,
  DnsRecordPageSchemaObject,
  type DnsRecordSchema,
  DnsRecordSchemaObject,
} from './DnsRecord.ts';
export {
  type DnsRecordBatchRequestSchema,
  DnsRecordBatchRequestSchemaObject,
  type DnsRecordBatchResultSchema,
  DnsRecordBatchResultSchemaObject,
} from './DnsRecordBatch.ts';
export {
  type DnsRecordPatchSchema,
  DnsRecordPatchSchemaObject,
  type DnsRecordRequestSchema,
  DnsRecordRequestSchemaObject,
} from './DnsRecordRequest.ts';
export {
  DNS_RECORD_TYPES,
  type DnsRecordTypeSchema,
  DnsRecordTypeSchemaObject,
} from './DnsRecordType.ts';
export {
  type ErrorEnvelopeSchema,
  ErrorEnvelopeSchemaObject,
  type ErrorItemSchema,
  ErrorItemSchemaObject,
} from './Error.ts';
export {
  DNS_RECORD_ORDERS,
  type ListDnsRecordsQuerySchema,
  ListDnsRecordsQuerySchemaObject,
  MAX_RECORDS_PER_PAGE,
} from './ListDnsRecordsQuery.ts';
export {
  type ListZonesQuerySchema,
  ListZonesQuerySchemaObject,
  MAX_ZONES_PER_PAGE,
  MIN_ZONES_PER_PAGE,
  ZONE_ORDERS,
  ZONE_STATUSES,
} from './ListZonesQuery.ts';
export { type ResultInfoSchema, ResultInfoSchemaObject } from './ResultInfo.ts';
export {
  type ZonePageSchema,
  ZonePageSchemaObject,
  type ZoneSchema,
  ZoneSchemaObject,
} from './Zone.ts';
