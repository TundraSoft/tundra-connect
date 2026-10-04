/**
 * Manage Cloudflare for SaaS custom hostnames through the `client/v4` REST
 * API (`/zones/{zone_id}/custom_hostnames`): add a customer's domain, read
 * its ownership-verification and certificate-validation state, update or
 * remove it, list and page through all of them, and manage the zone's
 * fallback origin and hostname quota.
 *
 * Typed Cloudflare for SaaS client: create, list, inspect, update and
 * delete custom hostnames with their TLS and ownership validation state,
 * manage the fallback origin, and read the hostname quota.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`CloudflareSaaSError` and its code registry).
 *
 * @example
 * ```ts
 * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
 * import { CloudflareSaaSError } from '@tundraconnect/cloudflare-saas/errors';
 *
 * const saas = new CloudflareSaaS({
 *   auth: { type: 'BEARER', token: Deno.env.get('CF_API_TOKEN')! },
 *   zoneId: Deno.env.get('CF_SAAS_ZONE_ID')!,
 * });
 *
 * // 1. A customer enters `app.customer.com` in your onboarding flow.
 * try {
 *   const created = await saas.createCustomHostname({
 *     hostname: 'app.customer.com',
 *     ssl: { method: 'txt', type: 'dv' }, // validate before they change DNS
 *   });
 *   // 2. Show them what to publish: the ownership TXT and the DCV TXT.
 *   console.log(created.ownership_verification);
 *   console.log(created.ssl?.validation_records);
 *
 *   // 3. Poll until both are active, then tell them to CNAME at your SaaS target.
 *   const current = await saas.getCustomHostname({ id: created.id });
 *   const live = current.status === 'active' && current.ssl?.status === 'active';
 *   console.log(live ? 'ready' : 'still pending');
 * } catch (err) {
 *   if (err instanceof CloudflareSaaSError) {
 *     // Branch on the stable code name, never on a message substring.
 *     if (err.code === 'DUPLICATE_HOSTNAME') {
 *       // already attached — look it up with listCustomHostnames({ hostname })
 *     }
 *     console.error(err.code, err.getContextValue('vendorCode'));
 *   }
 *   throw err;
 * }
 * ```
 *
 * @module
 */

// Export main client class
export {
  CLOUDFLARE_API,
  CloudflareSaaS,
  type CloudflareSaaSAuth,
  type CloudflareSaaSOptions,
  type CreateCustomHostnameOptions,
  type CustomHostnameRefOptions,
  DEFAULT_SSL,
  type DeletedCustomHostname,
  type FindCustomHostnameOptions,
  type ListCustomHostnamesOptions,
  type SetFallbackOriginOptions,
  type UpdateCustomHostnameOptions,
} from './CloudflareSaaS.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
