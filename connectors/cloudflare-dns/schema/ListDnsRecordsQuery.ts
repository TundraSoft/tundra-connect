import { type BaseGuardian, Guardian } from '@guardian';
import {
  type DnsRecordTypeSchema,
  DnsRecordTypeSchemaObject,
} from './DnsRecordType.ts';

/** Cloudflare's `per_page` ceiling for DNS records. */
export const MAX_RECORDS_PER_PAGE = 5_000_000;

/** Fields `listRecords` can order by. */
export const DNS_RECORD_ORDERS = [
  'type',
  'name',
  'content',
  'ttl',
  'proxied',
] as const;

/**
 * Type definition for {@link ListDnsRecordsQuerySchemaObject}: the filters,
 * paging and ordering of `GET /zones/{zone_id}/dns_records`, with
 * Cloudflare's own parameter names.
 */
export type ListDnsRecordsQuerySchema = {
  /** Only records of this type. */
  type?: DnsRecordTypeSchema;
  /** Only records with exactly this name (case-insensitive). */
  name?: string;
  /** Only records with exactly this content. */
  content?: string;
  /** Only proxied (or only unproxied) records. */
  proxied?: boolean;
  /** Whether a record must match `all` filters or `any`. @default all */
  match?: 'any' | 'all';
  /** Only records with exactly this comment. */
  comment?: string;
  /** Only records carrying exactly this tag (`name:value`). */
  tag?: string;
  /** Whether a record must match all `tag` filters or any. @default all */
  tag_match?: 'any' | 'all';
  /** Free-text search across name, content, comment and tags. */
  search?: string;
  /** Page number, from 1. @default 1 */
  page?: number;
  /** Records per page, 1–5,000,000. @default 100 */
  per_page?: number;
  /** Field to order by. @default type */
  order?: typeof DNS_RECORD_ORDERS[number];
  /** Sort direction. */
  direction?: 'asc' | 'desc';
};

/**
 * Schema for the `listRecords` query.
 *
 * @example
 * ```typescript
 * import { ListDnsRecordsQuerySchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * const [error, query] = ListDnsRecordsQuerySchemaObject.safeParse({
 *   type: 'A',
 *   name: 'app.example.com',
 *   per_page: 50,
 * });
 * ```
 */
export const ListDnsRecordsQuerySchemaObject: BaseGuardian<
  ListDnsRecordsQuerySchema
> = Guardian.object({
  type: DnsRecordTypeSchemaObject.optional(),
  name: Guardian.string().optional(),
  content: Guardian.string().optional(),
  proxied: Guardian.boolean().strict().optional(),
  match: Guardian.enum(['any', 'all'] as const).optional(),
  comment: Guardian.string().optional(),
  tag: Guardian.string().optional(),
  tag_match: Guardian.enum(['any', 'all'] as const).optional(),
  search: Guardian.string().optional(),
  page: Guardian.number().integer().min(1, '`page` starts at 1').optional(),
  per_page: Guardian.number().integer().range(
    1,
    MAX_RECORDS_PER_PAGE,
    `\`per_page\` must be between 1 and ${MAX_RECORDS_PER_PAGE}`,
  ).optional(),
  order: Guardian.enum(DNS_RECORD_ORDERS).optional(),
  direction: Guardian.enum(['asc', 'desc'] as const).optional(),
}).describe({
  title: 'List DNS records query',
  description:
    'Filters, paging and ordering for listing the DNS records of a zone.',
});
