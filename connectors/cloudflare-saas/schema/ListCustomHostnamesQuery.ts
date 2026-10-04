import { type BaseGuardian, Guardian } from '@guardian';
import { CUSTOM_HOSTNAME_STATUSES } from './CustomHostname.ts';
import {
  CERTIFICATE_AUTHORITIES,
  CUSTOM_HOSTNAME_SSL_STATUSES,
} from './CustomHostnameSsl.ts';

/** Cloudflare's `per_page` bounds for custom hostnames. */
export const MIN_HOSTNAMES_PER_PAGE = 5;
export const MAX_HOSTNAMES_PER_PAGE = 1000;

/**
 * Type definition for {@link ListCustomHostnamesQuerySchemaObject}: the
 * filters, paging and ordering of `GET /zones/{zone_id}/custom_hostnames`,
 * with Cloudflare's own parameter names.
 */
export type ListCustomHostnamesQuerySchema = {
  /**
   * Hostname to match. Cloudflare documents this as a fully qualified name
   * but has been seen matching partially, so do not rely on it for an
   * exact lookup — use `findCustomHostname`, which sends `hostname.exact`
   * and re-checks the result.
   */
  hostname?: string;
  /** Only the hostname with this id (cannot be combined with other filters). */
  id?: string;
  /** Only hostnames whose certificate is in this state. */
  ssl_status?: typeof CUSTOM_HOSTNAME_SSL_STATUSES[number];
  /** Only hostnames in this activation state. */
  hostname_status?: typeof CUSTOM_HOSTNAME_STATUSES[number];
  /** Only hostnames whose certificate is from this CA. */
  certificate_authority?: typeof CERTIFICATE_AUTHORITIES[number];
  /** Only wildcard (or only non-wildcard) hostnames. */
  wildcard?: boolean;
  /** Only hostnames routed to this custom origin. */
  custom_origin_server?: string;
  /** Page number, from 1. @default 1 */
  page?: number;
  /** Hostnames per page, 5–1000. @default 20 */
  per_page?: number;
  /** Field to order by. */
  order?: 'ssl' | 'ssl_status';
  /** Sort direction. */
  direction?: 'asc' | 'desc';
};

/**
 * Schema for the `listCustomHostnames` query.
 *
 * @example
 * ```typescript
 * import { ListCustomHostnamesQuerySchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, query] = ListCustomHostnamesQuerySchemaObject.safeParse({
 *   hostname_status: 'pending',
 *   per_page: 50,
 * });
 * ```
 */
export const ListCustomHostnamesQuerySchemaObject: BaseGuardian<
  ListCustomHostnamesQuerySchema
> = Guardian.object({
  hostname: Guardian.string().notEmpty('`hostname` cannot be empty').optional(),
  id: Guardian.string().notEmpty('`id` cannot be empty').optional(),
  ssl_status: Guardian.enum(CUSTOM_HOSTNAME_SSL_STATUSES).optional(),
  hostname_status: Guardian.enum(CUSTOM_HOSTNAME_STATUSES).optional(),
  certificate_authority: Guardian.enum(CERTIFICATE_AUTHORITIES).optional(),
  wildcard: Guardian.boolean().strict().optional(),
  custom_origin_server: Guardian.string().notEmpty(
    '`custom_origin_server` cannot be empty',
  ).optional(),
  page: Guardian.number().integer().min(1, '`page` starts at 1').optional(),
  per_page: Guardian.number().integer().range(
    MIN_HOSTNAMES_PER_PAGE,
    MAX_HOSTNAMES_PER_PAGE,
    `\`per_page\` must be between ${MIN_HOSTNAMES_PER_PAGE} and ${MAX_HOSTNAMES_PER_PAGE}`,
  ).optional(),
  order: Guardian.enum(['ssl', 'ssl_status'] as const).optional(),
  direction: Guardian.enum(['asc', 'desc'] as const).optional(),
}).describe({
  title: 'List custom hostnames query',
  description:
    'Filters, paging and ordering for listing the custom hostnames of a zone.',
});
