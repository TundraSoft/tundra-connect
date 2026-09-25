/**
 * The error model of `@tundraconnect/openweathermap`. Every failure the client
 * throws — invalid configuration, a rejected request, a vendor error, a
 * malformed response — is an `OpenWeatherMapError`. Its readonly `code` is a
 * key of `OpenWeatherMapErrorCodes`, so you can branch on the failure without
 * matching message text, and `getContextValue()` returns diagnostic context
 * such as the HTTP `status` or a `retryAfterSeconds` hint. Credentials never
 * appear in an error's message or context.
 *
 * @example
 * ```ts
 * import { OpenWeatherMapError } from '@tundraconnect/openweathermap/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof OpenWeatherMapError && err.code === 'RATE_LIMITED') {
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
  OpenWeatherMapError,
  type OpenWeatherMapErrorMetadata,
} from './Base.ts';
export {
  type OpenWeatherMapErrorCode,
  OpenWeatherMapErrorCodes,
} from './OpenWeatherMapErrorCodes.ts';
