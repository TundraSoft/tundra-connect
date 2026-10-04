import { type BaseGuardian, Guardian } from '@guardian';

/** Every fallback origin `status` Cloudflare documents. */
export const FALLBACK_ORIGIN_STATUSES = [
  'initializing',
  'pending_deployment',
  'pending_deletion',
  'active',
  'deployment_timed_out',
  'deletion_timed_out',
] as const;

/**
 * Type definition for {@link FallbackOriginSchemaObject}: the zone's
 * fallback origin as Cloudflare returns it.
 */
export type FallbackOriginSchema = {
  /** The origin hostname. */
  origin?: string;
  /** One of {@link FALLBACK_ORIGIN_STATUSES}. */
  status?: string;
  /** Errors met while activating the origin. */
  errors?: string[];
  /** ISO 8601 creation time. */
  created_at?: string;
  /** ISO 8601 last-update time. */
  updated_at?: string;
};

/**
 * Schema for the fallback origin. Every field is optional and unknown keys
 * pass through.
 *
 * @example
 * ```typescript
 * import { FallbackOriginSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, origin] = FallbackOriginSchemaObject.safeParse({
 *   origin: 'fallback.example.com',
 *   status: 'active',
 *   errors: [],
 * });
 * ```
 */
export const FallbackOriginSchemaObject: BaseGuardian<FallbackOriginSchema> =
  Guardian.object({
    origin: Guardian.string().optional(),
    status: Guardian.string().optional(),
    errors: Guardian.array(Guardian.string()).optional(),
    created_at: Guardian.string().optional(),
    updated_at: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Fallback origin',
    description:
      'The origin custom hostnames are routed to by default, with its deployment status.',
  });
