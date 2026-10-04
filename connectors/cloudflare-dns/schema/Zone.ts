import { type BaseGuardian, Guardian } from '@guardian';
import { type ResultInfoSchema, ResultInfoSchemaObject } from './ResultInfo.ts';

/**
 * Type definition for {@link ZoneSchemaObject}: a zone as Cloudflare
 * returns it, kept lenient — only `id` and `name` are required, and the
 * nested `account`/`owner`/`plan`/`meta` blocks are open objects.
 */
export type ZoneSchema = {
  /** Zone id. */
  id: string;
  /** The domain name. */
  name: string;
  /** `initializing` | `pending` | `active` | `moved`. */
  status?: string;
  /** `true` when the zone is DNS-only (not proxied). */
  paused?: boolean;
  /** `full` | `partial` | `secondary` | `internal`. */
  type?: string;
  /** Name servers Cloudflare assigned. */
  name_servers?: string[];
  /** Name servers before the move to Cloudflare. */
  original_name_servers?: string[] | null;
  /** The owning account. */
  account?: { id?: string; name?: string; [key: string]: unknown };
  /** The zone owner. */
  owner?: Record<string, unknown>;
  /** Subscription information. */
  plan?: Record<string, unknown>;
  /** Cloudflare's metadata about the zone. */
  meta?: Record<string, unknown>;
  /** Seconds until development mode expires (or since it expired, negative). */
  development_mode?: number;
  /** ISO 8601 creation time. */
  created_on?: string;
  /** ISO 8601 last-modified time. */
  modified_on?: string;
  /** ISO 8601 activation time. */
  activated_on?: string | null;
};

/**
 * Schema for one zone. Unknown keys pass through.
 *
 * @example
 * ```typescript
 * import { ZoneSchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * const [error, zone] = ZoneSchemaObject.safeParse({
 *   id: '023e105f4ecef8ad9ca31a8372d0c353',
 *   name: 'example.com',
 *   status: 'active',
 *   name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
 * });
 * ```
 */
export const ZoneSchemaObject: BaseGuardian<ZoneSchema> = Guardian.object({
  id: Guardian.string(),
  name: Guardian.string(),
  status: Guardian.string().optional(),
  paused: Guardian.boolean().strict().optional(),
  type: Guardian.string().optional(),
  name_servers: Guardian.array(Guardian.string()).optional(),
  original_name_servers: Guardian.array(Guardian.string()).nullable()
    .optional(),
  account: Guardian.object({
    id: Guardian.string().optional(),
    name: Guardian.string().optional(),
  }).passthrough().optional(),
  owner: Guardian.object({}).passthrough().optional(),
  plan: Guardian.object({}).passthrough().optional(),
  meta: Guardian.object({}).passthrough().optional(),
  development_mode: Guardian.number().optional(),
  created_on: Guardian.string().optional(),
  modified_on: Guardian.string().optional(),
  activated_on: Guardian.string().nullable().optional(),
}).passthrough().describe({
  title: 'Zone',
  description:
    'A Cloudflare zone. Only id and name are required; additive vendor fields pass through.',
});

/** Type definition for {@link ZonePageSchemaObject}: one page of zones. */
export type ZonePageSchema = {
  /** The zones on this page. */
  result: ZoneSchema[];
  /** Paging information, when Cloudflare sent it. */
  result_info?: ResultInfoSchema;
};

/**
 * Schema for a page of zones — what `listZones` resolves to.
 *
 * @example
 * ```typescript
 * import { ZonePageSchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * const [error, page] = ZonePageSchemaObject.safeParse({ result: [] });
 * ```
 */
export const ZonePageSchemaObject: BaseGuardian<ZonePageSchema> = Guardian
  .object({
    result: Guardian.array(ZoneSchemaObject),
    result_info: ResultInfoSchemaObject.optional(),
  }).describe({
    title: 'Zone page',
    description: 'One page of zones with its paging information.',
  });
