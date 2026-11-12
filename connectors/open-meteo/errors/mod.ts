/**
 * The error model of `@tundraconnect/open-meteo`. Every failure the client
 * throws — invalid configuration, a rejected request, a vendor error, a
 * malformed response — is an `OpenMeteoError`. Its readonly `code` is a
 * key of `OpenMeteoErrorCodes`, so you can branch on the failure without
 * matching message text, and `getContextValue()` returns diagnostic context
 * such as the HTTP `status` or a `retryAfterSeconds` hint. Credentials never
 * appear in an error's message or context.
 *
 * @example
 * ```ts
 * import { OpenMeteoError } from '@tundraconnect/open-meteo/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof OpenMeteoError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { OpenMeteoError, type OpenMeteoErrorMetadata } from './Base.ts';
export {
  OPENMETEO_TRANSIENT_CODES,
  type OpenMeteoErrorCode,
  OpenMeteoErrorCodes,
} from './OpenMeteoErrorCodes.ts';
