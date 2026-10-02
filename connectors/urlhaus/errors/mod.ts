/**
 * The error model of `@tundraconnect/urlhaus`. Every failure the client
 * throws — invalid configuration, a URL or hash URLhaus refuses, a vendor
 * error, a timeout or network failure, a malformed response — is a
 * `URLhausError`. Its readonly `code` is a key of `URLhausErrorCodes`, so you
 * can branch on the failure without matching message text; `transient` is
 * `true` for the "no verdict yet, retry later" codes; and `getContextValue()`
 * returns diagnostic context such as the HTTP `status` or URLhaus's own
 * `vendorStatus` (its `query_status`). The Auth-Key never appears in an
 * error's message or context.
 *
 * A lookup that finds nothing is NOT an error: it resolves to
 * `{ listed: false }` / `{ found: false }`.
 *
 * @example
 * ```ts
 * import { URLhausError } from '@tundraconnect/urlhaus/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof URLhausError && err.transient) {
 *     // TIMEOUT / NETWORK_ERROR / SERVICE_UNAVAILABLE / RATE_LIMITED
 *     console.log('no verdict yet:', err.code);
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { URLhausError, type URLhausErrorMetadata } from './Base.ts';
export {
  URLHAUS_TRANSIENT_CODES,
  type URLhausErrorCode,
  URLhausErrorCodes,
} from './URLhausErrorCodes.ts';
