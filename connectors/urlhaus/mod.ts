/**
 * Look up URLs, hosts and payloads in abuse.ch's URLhaus malware-URL
 * database, under a hard per-call deadline, and get back typed results:
 * URLhaus's `no_results` becomes `{ listed: false }` rather than an error,
 * and every refusal becomes a `URLhausError` with a stable code.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`URLhausError`, its code registry and the transient-code set).
 *
 * @example
 * ```ts
 * import { URLhaus } from '@tundraconnect/urlhaus';
 * import { URLhausError } from '@tundraconnect/urlhaus/errors';
 *
 * const urlhaus = new URLhaus({
 *   auth: { type: 'CUSTOM', authKey: 'YOUR_AUTH_KEY' },
 *   timeout: 1.5,
 * });
 *
 * try {
 *   const verdict = await urlhaus.lookupUrl({ url: 'http://example.com/x.exe' });
 *   console.log(verdict.listed ? verdict.entry.url_status : 'not listed');
 * } catch (err) {
 *   if (err instanceof URLhausError && err.transient) {
 *     console.log('no verdict yet:', err.code); // retry later
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

// Export main client class
export {
  type FoundResult,
  type ListedResult,
  type LookupHostOptions,
  type LookupPayloadOptions,
  type LookupSignatureOptions,
  type LookupTagOptions,
  type LookupUrlIdOptions,
  type LookupUrlOptions,
  type RecentOptions,
  URLhaus,
  URLHAUS_API,
  type URLhausAuth,
  type URLhausCallOptions,
  type URLhausOptions,
} from './URLhaus.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
