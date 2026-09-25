/**
 * The error model of `@tundraconnect/telegram`. Every failure the client throws
 * — invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `TelegramError`. Its readonly `code` is a key of
 * `TelegramErrorCodes`, so you can branch on the failure without matching
 * message text, and `getContextValue()` returns diagnostic context such as the
 * HTTP `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { TelegramError } from '@tundraconnect/telegram/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof TelegramError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { TelegramError, type TelegramErrorMetadata } from './Base.ts';
export {
  type TelegramErrorCode,
  TelegramErrorCodes,
} from './TelegramErrorCodes.ts';
