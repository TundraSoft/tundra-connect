/**
 * The error model of `@tundraconnect/resend`. Every failure the client
 * throws — invalid configuration, a rejected request, a vendor error, a
 * malformed response, a webhook that fails verification — is a
 * `ResendError`. Its readonly `code` is a key of `ResendErrorCodes`, so you
 * can branch on the failure without matching message text, and
 * `getContextValue()` returns diagnostic context such as the HTTP `status`,
 * Resend's own error `vendorName`, or a `retryAfterSeconds` hint.
 * Credentials never appear in an error's message or context.
 *
 * @example
 * ```ts
 * import { ResendError } from '@tundraconnect/resend/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof ResendError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { ResendError, type ResendErrorMetadata } from './Base.ts';
export {
  RESEND_TRANSIENT_CODES,
  type ResendErrorCode,
  ResendErrorCodes,
} from './ResendErrorCodes.ts';
