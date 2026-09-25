/**
 * The error model of `@tundraconnect/ntfy`. Every failure the client throws —
 * invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `NtfyError`. Its readonly `code` is a key of
 * `NtfyErrorCodes`, so you can branch on the failure without matching message
 * text, and `getContextValue()` returns diagnostic context such as the HTTP
 * `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { NtfyError } from '@tundraconnect/ntfy/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof NtfyError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { NtfyError, type NtfyErrorMetadata } from './Base.ts';
export { type NtfyErrorCode, NtfyErrorCodes } from './NtfyErrorCodes.ts';
