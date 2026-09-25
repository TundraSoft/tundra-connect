/**
 * The error model of `@tundraconnect/sentry`. Every failure the client throws —
 * invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `SentryError`. Its readonly `code` is a key of
 * `SentryErrorCodes`, so you can branch on the failure without matching message
 * text, and `getContextValue()` returns diagnostic context such as the HTTP
 * `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { SentryError } from '@tundraconnect/sentry/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof SentryError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { SentryError, type SentryErrorMetadata } from './Base.ts';
export { type SentryErrorCode, SentryErrorCodes } from './SentryErrorCodes.ts';
