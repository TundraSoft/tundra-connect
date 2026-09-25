/**
 * The error model of `@tundraconnect/sendgrid`. Every failure the client throws
 * — invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `SendGridError`. Its readonly `code` is a key of
 * `SendGridErrorCodes`, so you can branch on the failure without matching
 * message text, and `getContextValue()` returns diagnostic context such as the
 * HTTP `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { SendGridError } from '@tundraconnect/sendgrid/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof SendGridError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { SendGridError, type SendGridErrorMetadata } from './Base.ts';
export {
  type SendGridErrorCode,
  SendGridErrorCodes,
} from './SendGridErrorCodes.ts';
