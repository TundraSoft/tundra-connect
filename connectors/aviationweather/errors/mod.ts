/**
 * The error model of `@tundraconnect/aviationweather`. Every failure the client
 * throws — invalid configuration, a rejected request, a vendor error, a
 * malformed response — is an `AviationWeatherError`. Its readonly `code` is a
 * key of `AviationWeatherErrorCodes`, so you can branch on the failure without
 * matching message text, and `getContextValue()` returns diagnostic context
 * such as the HTTP `status` or a `retryAfterSeconds` hint. Credentials never
 * appear in an error's message or context.
 *
 * @example
 * ```ts
 * import { AviationWeatherError } from '@tundraconnect/aviationweather/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof AviationWeatherError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export {
  AviationWeatherError,
  type AviationWeatherErrorMetadata,
} from './Base.ts';
export {
  AVIATIONWEATHER_TRANSIENT_CODES,
  type AviationWeatherErrorCode,
  AviationWeatherErrorCodes,
} from './AviationWeatherErrorCodes.ts';
