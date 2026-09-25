/**
 * The error model of `@tundraconnect/paypal`. Every failure the client throws —
 * invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `PayPalError`. Its readonly `code` is a key of
 * `PayPalErrorCodes`, so you can branch on the failure without matching message
 * text, and `getContextValue()` returns diagnostic context such as the HTTP
 * `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { PayPalError } from '@tundraconnect/paypal/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof PayPalError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { PayPalError, type PayPalErrorMetadata } from './Base.ts';
export { type PayPalErrorCode, PayPalErrorCodes } from './PayPalErrorCodes.ts';
