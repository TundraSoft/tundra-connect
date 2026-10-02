/**
 * The error model of `@tundraconnect/google-web-risk`. Every failure the
 * client throws — invalid configuration, a rejected request, a vendor error, a
 * timeout or network failure, a malformed response — is a
 * `GoogleWebRiskError`. Its readonly `code` is a key of
 * `GoogleWebRiskErrorCodes`, so you can branch on the failure without matching
 * message text; `transient` is `true` for the "no verdict yet, retry later"
 * codes; and `getContextValue()` returns diagnostic context such as the HTTP
 * `status`. The API key never appears in an error's message or context.
 *
 * @example
 * ```ts
 * import { GoogleWebRiskError } from '@tundraconnect/google-web-risk/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof GoogleWebRiskError && err.transient) {
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

export { GoogleWebRiskError, type GoogleWebRiskErrorMetadata } from './Base.ts';
export {
  GOOGLE_WEB_RISK_TRANSIENT_CODES,
  type GoogleWebRiskErrorCode,
  GoogleWebRiskErrorCodes,
} from './GoogleWebRiskErrorCodes.ts';
