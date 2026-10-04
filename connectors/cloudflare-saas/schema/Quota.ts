import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for {@link CustomHostnameQuotaSchemaObject}. */
export type CustomHostnameQuotaSchema = {
  /** Custom hostnames the zone is allocated. */
  allocated?: number;
  /** Custom hostnames currently in use. */
  used?: number;
  /** Hard ceiling before creates are rejected. */
  hard_cap?: number;
  /** Whether usage exceeds the allocation. */
  exceeded?: boolean;
};

/**
 * Schema for the zone's custom hostname quota.
 *
 * @example
 * ```typescript
 * import { CustomHostnameQuotaSchemaObject } from '@tundraconnect/cloudflare-saas/schemas';
 *
 * const [error, quota] = CustomHostnameQuotaSchemaObject.safeParse({
 *   allocated: 100,
 *   used: 12,
 *   hard_cap: 100,
 *   exceeded: false,
 * });
 * ```
 */
export const CustomHostnameQuotaSchemaObject: BaseGuardian<
  CustomHostnameQuotaSchema
> = Guardian.object({
  allocated: Guardian.number().optional(),
  used: Guardian.number().optional(),
  hard_cap: Guardian.number().optional(),
  exceeded: Guardian.boolean().strict().optional(),
}).passthrough().describe({
  title: 'Custom hostname quota',
  description:
    'Allocated, used and hard-cap custom hostname counts for the zone.',
});
