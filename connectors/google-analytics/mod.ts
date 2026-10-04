/**
 * Send server-side events to a Google Analytics 4 property through the
 * Measurement Protocol (`POST /mp/collect`), and validate payloads against
 * its debug endpoint (`POST /debug/mp/collect`), with GA4's documented
 * limits and reserved names checked before anything is sent.
 *
 * Typed Google Analytics 4 Measurement Protocol client: send server-side
 * events and validate them against the debug endpoint, with GA4's event,
 * parameter and user-property limits checked before the request is made.
 *
 * Subpaths: `./schemas` (Guardian schemas, inferred types and GA4's limits)
 * and `./errors` (`GoogleAnalyticsError` and its code registry).
 *
 * @example
 * ```ts
 * import { GoogleAnalytics } from '@tundraconnect/google-analytics';
 * import { GoogleAnalyticsError } from '@tundraconnect/google-analytics/errors';
 *
 * const ga = new GoogleAnalytics({
 *   auth: { type: 'CUSTOM', apiSecret: Deno.env.get('GA4_API_SECRET')! },
 *   measurementId: 'G-XXXXXXXXXX',
 *   region: 'eu',
 * });
 *
 * const payload = {
 *   client_id: '123456789.1700000000',
 *   events: [{
 *     name: 'link_click',
 *     params: { link_id: 'abc', session_id: 1700000000, engagement_time_msec: 1 },
 *   }],
 * };
 *
 * // While developing: ask Google what it thinks.
 * const check = await ga.validate(payload);
 * if (!check.valid) console.log(check.validationMessages);
 *
 * try {
 *   await ga.send(payload);
 * } catch (err) {
 *   if (err instanceof GoogleAnalyticsError && err.transient) {
 *     // queue and retry later
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
  GA4_API,
  GA4_API_EU,
  GoogleAnalytics,
  type GoogleAnalyticsAuth,
  type GoogleAnalyticsOptions,
  type ValidationResult,
} from './GoogleAnalytics.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
