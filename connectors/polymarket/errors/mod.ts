/**
 * The error model of `@tundraconnect/polymarket`. Every failure the client
 * throws — invalid configuration, a rejected request, a vendor error, a
 * malformed response — is an `PolymarketError`. Its readonly `code` is a key of
 * `PolymarketErrorCodes`, so you can branch on the failure without matching
 * message text, and `getContextValue()` returns diagnostic context such as the
 * HTTP `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { PolymarketError } from '@tundraconnect/polymarket/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof PolymarketError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { PolymarketError, type PolymarketErrorMetadata } from './Base.ts';
export {
  type PolymarketErrorCode,
  PolymarketErrorCodes,
} from './PolymarketErrorCodes.ts';
