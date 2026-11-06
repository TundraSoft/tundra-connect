/**
 * The error model of `@tundraconnect/deribit`. Every failure the client
 * throws — invalid configuration, a rejected request, a vendor error, a
 * malformed response — is an `DeribitError`. Its readonly `code` is a
 * key of `DeribitErrorCodes`, so you can branch on the failure without
 * matching message text, and `getContextValue()` returns diagnostic context
 * such as the HTTP `status` or a `retryAfterSeconds` hint. Credentials never
 * appear in an error's message or context.
 *
 * @example
 * ```ts
 * import { DeribitError } from '@tundraconnect/deribit/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof DeribitError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { DeribitError, type DeribitErrorMetadata } from './Base.ts';
export {
  DERIBIT_TRANSIENT_CODES,
  type DeribitErrorCode,
  deribitErrorCode,
  DeribitErrorCodes,
} from './DeribitErrorCodes.ts';
