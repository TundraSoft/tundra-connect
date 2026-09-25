/**
 * The error model of `@tundraconnect/razorpay`. Every failure the client throws
 * — invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `RazorpayError`. Its readonly `code` is a key of
 * `RazorpayErrorCodes`, so you can branch on the failure without matching
 * message text, and `getContextValue()` returns diagnostic context such as the
 * HTTP `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { RazorpayError } from '@tundraconnect/razorpay/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof RazorpayError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { RazorpayError, type RazorpayErrorMetadata } from './Base.ts';
export {
  type RazorpayErrorCode,
  RazorpayErrorCodes,
} from './RazorpayErrorCodes.ts';
