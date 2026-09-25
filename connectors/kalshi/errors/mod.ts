/**
 * The error model of `@tundraconnect/kalshi`. Every failure the client throws —
 * invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `KalshiError`. Its readonly `code` is a key of
 * `KalshiErrorCodes`, so you can branch on the failure without matching message
 * text, and `getContextValue()` returns diagnostic context such as the HTTP
 * `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { KalshiError } from '@tundraconnect/kalshi/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof KalshiError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { KalshiError, type KalshiErrorMetadata } from './Base.ts';
export { type KalshiErrorCode, KalshiErrorCodes } from './KalshiErrorCodes.ts';
