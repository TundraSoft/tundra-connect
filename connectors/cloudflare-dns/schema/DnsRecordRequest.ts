import { type BaseGuardian, Guardian } from '@guardian';
import {
  type DnsRecordTypeSchema,
  DnsRecordTypeSchemaObject,
} from './DnsRecordType.ts';

/** Cloudflare's TTL bounds: `1` (automatic) or 30–86400 seconds (30 is Enterprise-only; others start at 60). */
const TTL_AUTOMATIC = 1;
const TTL_MIN = 30;
const TTL_MAX = 86400;

/** Longest DNS name Cloudflare accepts. */
const MAX_NAME_LENGTH = 255;

const ttlGuardian = Guardian.number().integer().refine(
  (ttl) => ttl === TTL_AUTOMATIC || (ttl >= TTL_MIN && ttl <= TTL_MAX),
  `\`ttl\` must be ${TTL_AUTOMATIC} (automatic) or between ${TTL_MIN} and ${TTL_MAX} seconds`,
);

/**
 * The fields a record request may carry, shared by the create / replace
 * shape and the patch shape. Not part of the public surface — the
 * annotated schema objects below are.
 */
export const DNS_RECORD_PATCH_FIELDS = {
  type: DnsRecordTypeSchemaObject.optional(),
  name: Guardian.string().notEmpty('`name` cannot be empty').maxLength(
    MAX_NAME_LENGTH,
    `\`name\` cannot exceed ${MAX_NAME_LENGTH} characters`,
  ).optional(),
  content: Guardian.string().optional(),
  data: Guardian.object({}).passthrough().optional(),
  ttl: ttlGuardian.optional(),
  proxied: Guardian.boolean().strict().optional(),
  priority: Guardian.number().integer().range(
    0,
    65535,
    '`priority` must be between 0 and 65535',
  ).optional(),
  comment: Guardian.string().optional(),
  tags: Guardian.array(Guardian.string()).optional(),
  settings: Guardian.object({}).passthrough().optional(),
};

/** As {@link DNS_RECORD_PATCH_FIELDS}, with `type` and `name` required. */
export const DNS_RECORD_REQUEST_FIELDS = {
  ...DNS_RECORD_PATCH_FIELDS,
  type: DnsRecordTypeSchemaObject,
  name: Guardian.string().notEmpty('`name` cannot be empty').maxLength(
    MAX_NAME_LENGTH,
    `\`name\` cannot exceed ${MAX_NAME_LENGTH} characters`,
  ),
};

/**
 * Type definition for {@link DnsRecordRequestSchemaObject}: a record to
 * create or to replace an existing one with. Field names are Cloudflare's
 * own, so a body copied from its docs works unchanged.
 *
 * Either `content` or `data` must be present; the client enforces that,
 * since an object schema cannot express either/or.
 */
export type DnsRecordRequestSchema = {
  /** Record type. */
  type: DnsRecordTypeSchema;
  /** Record name, e.g. `app.example.com` or `@` for the apex. */
  name: string;
  /** Record content for A/AAAA/CNAME/MX/NS/PTR/TXT/OPENPGPKEY. */
  content?: string;
  /** Structured components for SRV, CAA, LOC, TLSA, SSHFP, … */
  data?: Record<string, unknown>;
  /** TTL in seconds: `1` for automatic, else 30–86400. @default 1 */
  ttl?: number;
  /** Proxy traffic through Cloudflare (A/AAAA/CNAME only). @default false */
  proxied?: boolean;
  /** MX / URI priority, 0–65535. */
  priority?: number;
  /** Free-form note; no effect on DNS. */
  comment?: string;
  /** Custom tags; no effect on DNS. */
  tags?: string[];
  /** Per-record settings (`ipv4_only`, `ipv6_only`, `flatten_cname`). */
  settings?: Record<string, unknown>;
};

/**
 * Schema for a record to create (`POST`) or replace (`PUT`).
 *
 * @example
 * ```typescript
 * import { DnsRecordRequestSchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * const [error, record] = DnsRecordRequestSchemaObject.safeParse({
 *   type: 'TXT',
 *   name: '_acme-challenge.example.com',
 *   content: '"token"',
 *   ttl: 60,
 * });
 * ```
 */
export const DnsRecordRequestSchemaObject: BaseGuardian<
  DnsRecordRequestSchema
> = Guardian.object(DNS_RECORD_REQUEST_FIELDS).describe({
  title: 'DNS record request',
  description:
    'A record to create or replace: type and name, plus content or data and the optional ttl, proxied, priority, comment, tags and settings.',
});

/**
 * Type definition for {@link DnsRecordPatchSchemaObject}: the fields of a
 * record to change. Every field is optional; the client requires at least
 * one.
 */
export type DnsRecordPatchSchema = Partial<DnsRecordRequestSchema>;

/**
 * Schema for a partial update (`PATCH`).
 *
 * @example
 * ```typescript
 * import { DnsRecordPatchSchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * const [error, changes] = DnsRecordPatchSchemaObject.safeParse({
 *   content: '203.0.113.11',
 *   comment: 'moved',
 * });
 * ```
 */
export const DnsRecordPatchSchemaObject: BaseGuardian<DnsRecordPatchSchema> =
  Guardian.object(DNS_RECORD_PATCH_FIELDS).describe({
    title: 'DNS record patch',
    description: 'The fields of an existing record to change.',
  });
