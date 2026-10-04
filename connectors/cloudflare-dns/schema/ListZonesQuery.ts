import { type BaseGuardian, Guardian } from '@guardian';

/** Cloudflare's `per_page` bounds for zones. */
export const MIN_ZONES_PER_PAGE = 5;
export const MAX_ZONES_PER_PAGE = 50;

/** Zone statuses Cloudflare reports. */
export const ZONE_STATUSES = [
  'initializing',
  'pending',
  'active',
  'moved',
] as const;

/** Fields `listZones` can order by. */
export const ZONE_ORDERS = [
  'name',
  'status',
  'account.id',
  'account.name',
  'plan.id',
] as const;

/**
 * Type definition for {@link ListZonesQuerySchemaObject}: the filters,
 * paging and ordering of `GET /zones`, with Cloudflare's own names.
 */
export type ListZonesQuerySchema = {
  /** Only the zone with exactly this domain name. */
  name?: string;
  /** Only zones in this status. */
  status?: typeof ZONE_STATUSES[number];
  /** Whether a zone must match `all` filters or `any`. @default all */
  match?: 'any' | 'all';
  /** Page number, from 1. @default 1 */
  page?: number;
  /** Zones per page, 5–50. @default 20 */
  per_page?: number;
  /** Field to order by. */
  order?: typeof ZONE_ORDERS[number];
  /** Sort direction. */
  direction?: 'asc' | 'desc';
};

/**
 * Schema for the `listZones` query.
 *
 * @example
 * ```typescript
 * import { ListZonesQuerySchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * const [error, query] = ListZonesQuerySchemaObject.safeParse({
 *   name: 'example.com',
 * });
 * ```
 */
export const ListZonesQuerySchemaObject: BaseGuardian<ListZonesQuerySchema> =
  Guardian.object({
    name: Guardian.string().notEmpty('`name` cannot be empty').optional(),
    status: Guardian.enum(ZONE_STATUSES).optional(),
    match: Guardian.enum(['any', 'all'] as const).optional(),
    page: Guardian.number().integer().min(1, '`page` starts at 1').optional(),
    per_page: Guardian.number().integer().range(
      MIN_ZONES_PER_PAGE,
      MAX_ZONES_PER_PAGE,
      `\`per_page\` must be between ${MIN_ZONES_PER_PAGE} and ${MAX_ZONES_PER_PAGE}`,
    ).optional(),
    order: Guardian.enum(ZONE_ORDERS).optional(),
    direction: Guardian.enum(['asc', 'desc'] as const).optional(),
  }).describe({
    title: 'List zones query',
    description: 'Filters, paging and ordering for listing zones.',
  });
