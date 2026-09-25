/**
 * The error model of `@tundraconnect/coingecko`. Every failure the client
 * throws — invalid configuration, a rejected request, a vendor error, a
 * malformed response — is an `CoinGeckoError`. Its readonly `code` is a key of
 * `CoinGeckoErrorCodes`, so you can branch on the failure without matching
 * message text, and `getContextValue()` returns diagnostic context such as the
 * HTTP `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { CoinGeckoError } from '@tundraconnect/coingecko/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof CoinGeckoError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { CoinGeckoError, type CoinGeckoErrorMetadata } from './Base.ts';
export {
  type CoinGeckoErrorCode,
  CoinGeckoErrorCodes,
} from './CoinGeckoErrorCodes.ts';
