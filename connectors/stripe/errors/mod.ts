/**
 * The error model of `@tundraconnect/stripe`. Every failure the client throws —
 * invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `StripeError`. Its readonly `code` is a key of
 * `StripeErrorCodes`, so you can branch on the failure without matching message
 * text, and `getContextValue()` returns diagnostic context such as the HTTP
 * `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { StripeError } from '@tundraconnect/stripe/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof StripeError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { StripeError, type StripeErrorMetadata } from './Base.ts';
export { type StripeErrorCode, StripeErrorCodes } from './StripeErrorCodes.ts';
