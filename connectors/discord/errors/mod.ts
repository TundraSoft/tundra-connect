/**
 * The error model of `@tundraconnect/discord`. Every failure the client throws
 * — invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `DiscordError`. Its readonly `code` is a key of
 * `DiscordErrorCodes`, so you can branch on the failure without matching
 * message text, and `getContextValue()` returns diagnostic context such as the
 * HTTP `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { DiscordError } from '@tundraconnect/discord/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof DiscordError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { DiscordError, type DiscordErrorMetadata } from './Base.ts';
export {
  type DiscordErrorCode,
  DiscordErrorCodes,
} from './DiscordErrorCodes.ts';
