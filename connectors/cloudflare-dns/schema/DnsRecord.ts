import { type BaseGuardian, Guardian } from '@guardian';
import { type ResultInfoSchema, ResultInfoSchemaObject } from './ResultInfo.ts';

/**
 * Type definition for {@link DnsRecordSchemaObject}: a DNS record as
 * Cloudflare returns it (the unwrapped `result`).
 *
 * Only `id`, `name` and `type` are required. Everything else is optional
 * because the fields present vary by record type (`content` vs `data`,
 * `priority` for MX/SRV/URI) and Cloudflare omits `comment_modified_on` /
 * `tags_modified_on` when there is nothing to report.
 */
export type DnsRecordSchema = {
  /** Record id. */
  id: string;
  /** Full record name, including the zone, in Punycode. */
  name: string;
  /** Record type, e.g. `A`. Kept as a string so a new type never fails a read. */
  type: string;
  /** Record content for simple types, or Cloudflare's formatted text for structured ones. */
  content?: string;
  /** Structured components for SRV, CAA, LOC, TLSA, … */
  data?: Record<string, unknown>;
  /** Whether Cloudflare can proxy this record. */
  proxiable?: boolean;
  /** Whether traffic is proxied through Cloudflare. */
  proxied?: boolean;
  /** TTL in seconds; `1` means automatic. */
  ttl?: number;
  /** MX / SRV / URI priority. */
  priority?: number;
  /** Free-form note; has no effect on DNS. */
  comment?: string | null;
  /** Custom tags; have no effect on DNS. */
  tags?: string[];
  /** Per-record settings (`ipv4_only`, `ipv6_only`, `flatten_cname`). */
  settings?: Record<string, unknown>;
  /** Cloudflare's own metadata about the record. */
  meta?: Record<string, unknown>;
  /** Id of the zone the record belongs to. */
  zone_id?: string;
  /** Name of the zone the record belongs to. */
  zone_name?: string;
  /** ISO 8601 creation time. */
  created_on?: string;
  /** ISO 8601 last-modified time. */
  modified_on?: string;
  /** ISO 8601 time the comment last changed; absent without a comment. */
  comment_modified_on?: string;
  /** ISO 8601 time the tags last changed; absent without tags. */
  tags_modified_on?: string;
};

/**
 * Schema for one DNS record in a response. Unknown keys pass through so an
 * additive vendor field never fails a read.
 *
 * @example
 * ```typescript
 * import { DnsRecordSchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * const [error, record] = DnsRecordSchemaObject.safeParse({
 *   id: '372e67954025e0ba6aaa6d586b9e0b59',
 *   name: 'app.example.com',
 *   type: 'A',
 *   content: '203.0.113.10',
 *   proxied: true,
 *   ttl: 1,
 * });
 * ```
 */
export const DnsRecordSchemaObject: BaseGuardian<DnsRecordSchema> = Guardian
  .object({
    id: Guardian.string(),
    name: Guardian.string(),
    type: Guardian.string(),
    content: Guardian.string().optional(),
    data: Guardian.object({}).passthrough().optional(),
    proxiable: Guardian.boolean().strict().optional(),
    proxied: Guardian.boolean().strict().optional(),
    ttl: Guardian.number().optional(),
    priority: Guardian.number().optional(),
    comment: Guardian.string().nullable().optional(),
    tags: Guardian.array(Guardian.string()).optional(),
    settings: Guardian.object({}).passthrough().optional(),
    meta: Guardian.object({}).passthrough().optional(),
    zone_id: Guardian.string().optional(),
    zone_name: Guardian.string().optional(),
    created_on: Guardian.string().optional(),
    modified_on: Guardian.string().optional(),
    comment_modified_on: Guardian.string().optional(),
    tags_modified_on: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'DNS record',
    description:
      'A DNS record as Cloudflare returns it. Only id, name and type are required; additive vendor fields pass through.',
  });

/** Type definition for {@link DnsRecordPageSchemaObject}: one page of records. */
export type DnsRecordPageSchema = {
  /** The records on this page. */
  result: DnsRecordSchema[];
  /** Paging information, when Cloudflare sent it. */
  result_info?: ResultInfoSchema;
};

/**
 * Schema for a page of DNS records — what `listRecords` resolves to.
 *
 * @example
 * ```typescript
 * import { DnsRecordPageSchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * const [error, page] = DnsRecordPageSchemaObject.safeParse({
 *   result: [],
 *   result_info: { page: 1, per_page: 100, count: 0, total_count: 0, total_pages: 0 },
 * });
 * ```
 */
export const DnsRecordPageSchemaObject: BaseGuardian<DnsRecordPageSchema> =
  Guardian.object({
    result: Guardian.array(DnsRecordSchemaObject),
    result_info: ResultInfoSchemaObject.optional(),
  }).describe({
    title: 'DNS record page',
    description: 'One page of DNS records with its paging information.',
  });
