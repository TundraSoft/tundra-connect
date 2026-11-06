/**
 * The error model of `@tundraconnect/eia`. Every failure the client
 * throws — invalid configuration, a rejected request, a vendor error, a
 * malformed response — is an `EIAError`. Its readonly `code` is a
 * key of `EIAErrorCodes`, so you can branch on the failure without
 * matching message text, and `getContextValue()` returns diagnostic context
 * such as the HTTP `status` or a `retryAfterSeconds` hint. Credentials never
 * appear in an error's message or context.
 *
 * @example
 * ```ts
 * import { EIAError } from '@tundraconnect/eia/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof EIAError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { EIAError, type EIAErrorMetadata } from './Base.ts';
export {
  EIA_TRANSIENT_CODES,
  type EIAErrorCode,
  EIAErrorCodes,
} from './EIAErrorCodes.ts';
