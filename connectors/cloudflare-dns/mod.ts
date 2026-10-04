/**
 * Manage the DNS records of a Cloudflare zone through the `client/v4` REST
 * API (`/zones/{zone_id}/dns_records`): list with filters and paging,
 * create, update, replace, delete, apply an atomic batch, export the zone
 * as a BIND file, and look up zones by name to find a zone id.
 *
 * Typed Cloudflare DNS client: list, create, update, replace, delete and
 * batch-edit DNS records in a zone, export the zone as BIND, and look up
 * zones by name.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`CloudflareDNSError` and its code registry).
 *
 * @example
 * ```ts
 * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
 * import { CloudflareDNSError } from '@tundraconnect/cloudflare-dns/errors';
 *
 * const dns = new CloudflareDNS({
 *   auth: { type: 'BEARER', token: Deno.env.get('CF_API_TOKEN')! },
 *   zoneId: Deno.env.get('CF_ZONE_ID')!,
 * });
 *
 * try {
 *   // Point a customer's subdomain at your app.
 *   const record = await dns.createRecord({
 *     type: 'CNAME',
 *     name: 'acme.example.com',
 *     content: 'app.example.com',
 *     proxied: true,
 *     comment: 'tenant: acme',
 *   });
 *   console.log('created', record.id);
 *
 *   // Later: find it again, change it, remove it.
 *   const { result } = await dns.listRecords({ type: 'CNAME', name: 'acme.example.com' });
 *   await dns.updateRecord({ recordId: result[0]!.id, content: 'app-v2.example.com' });
 *   await dns.deleteRecord({ recordId: result[0]!.id });
 * } catch (err) {
 *   if (err instanceof CloudflareDNSError) {
 *     // Branch on the stable code name, never on a message substring.
 *     if (err.code === 'RECORD_CONFLICT') {
 *       // an identical or conflicting record already exists
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
  type BatchOptions,
  CLOUDFLARE_API,
  CloudflareDNS,
  type CloudflareDNSAuth,
  type CloudflareDNSOptions,
  type CreateRecordOptions,
  type DeletedRecord,
  type ListRecordsOptions,
  type ListZonesOptions,
  type RecordRefOptions,
  type ReplaceRecordOptions,
  type UpdateRecordOptions,
  type ZoneScoped,
} from './CloudflareDNS.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
