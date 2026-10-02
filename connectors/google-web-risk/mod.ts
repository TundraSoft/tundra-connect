/**
 * Check a URL against Google Web Risk's malware, social-engineering and
 * unwanted-software lists with the Lookup API's `uris:search`, under a hard
 * per-call deadline — and get back a typed verdict rather than raw JSON.
 *
 * Only `uris:search` is wrapped: `hashes.search` is billed at $50 per 1,000
 * calls, and using the Update API reprices `uris:search` to that rate. See
 * the README's "Pricing and limits".
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`GoogleWebRiskError`, its code registry and the transient-code set).
 *
 * @example
 * ```ts
 * import { GoogleWebRisk } from '@tundraconnect/google-web-risk';
 * import { GoogleWebRiskError } from '@tundraconnect/google-web-risk/errors';
 *
 * const webRisk = new GoogleWebRisk({
 *   auth: { type: 'CUSTOM', apiKey: 'YOUR_API_KEY' },
 *   timeout: 1.5,
 * });
 *
 * try {
 *   const verdict = await webRisk.search({ uri: 'https://example.com/' });
 *   console.log(verdict.listed ? verdict.threatTypes : 'clean');
 * } catch (err) {
 *   if (err instanceof GoogleWebRiskError && err.transient) {
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
  GOOGLE_WEB_RISK_API,
  GoogleWebRisk,
  type GoogleWebRiskAuth,
  type GoogleWebRiskOptions,
  type SearchOptions,
  type SearchResult,
} from './GoogleWebRisk.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
