/**
 * The error model of `@tundraconnect/openexchange`. Every failure the client
 * throws — invalid configuration, a rejected request, a vendor error, a
 * malformed response — is an `OpenExchangeError`. Its readonly `code` is a key
 * of `OpenExchangeErrorCodes`, so you can branch on the failure without
 * matching message text, and `getContextValue()` returns diagnostic context
 * such as the HTTP `status` or a `retryAfterSeconds` hint. Credentials never
 * appear in an error's message or context.
 *
 * @example
 * ```ts
 * import { OpenExchangeError } from '@tundraconnect/openexchange/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof OpenExchangeError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { OpenExchangeError, type OpenExchangeErrorMetadata } from './Base.ts';
export {
  type OpenExchangeErrorCode,
  OpenExchangeErrorCodes,
} from './OpenExchangeErrorCodes.ts';
