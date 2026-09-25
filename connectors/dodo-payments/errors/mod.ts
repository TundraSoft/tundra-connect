/**
 * The error model of `@tundraconnect/dodo-payments`. Every failure the client
 * throws — invalid configuration, a rejected request, a vendor error, a
 * malformed response — is an `DodoPaymentsError`. Its readonly `code` is a key
 * of `DodoPaymentsErrorCodes`, so you can branch on the failure without
 * matching message text, and `getContextValue()` returns diagnostic context
 * such as the HTTP `status` or a `retryAfterSeconds` hint. Credentials never
 * appear in an error's message or context.
 *
 * @example
 * ```ts
 * import { DodoPaymentsError } from '@tundraconnect/dodo-payments/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof DodoPaymentsError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { DodoPaymentsError, type DodoPaymentsErrorMetadata } from './Base.ts';
export {
  type DodoPaymentsErrorCode,
  DodoPaymentsErrorCodes,
} from './DodoPaymentsErrorCodes.ts';
