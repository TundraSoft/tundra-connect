/**
 * The error model of `@tundraconnect/gcs`. Every failure the client throws —
 * invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `GCSError`. Its readonly `code` is a key of `GCSErrorCodes`,
 * so you can branch on the failure without matching message text, and
 * `getContextValue()` returns diagnostic context such as the HTTP `status` or a
 * `retryAfterSeconds` hint. Credentials never appear in an error's message or
 * context.
 *
 * @example
 * ```ts
 * import { GCSError } from '@tundraconnect/gcs/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof GCSError && err.code === 'RATE_LIMIT_EXCEEDED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { GCSError, type GCSErrorMetadata } from './Base.ts';
export { type GCSErrorCode, GCSErrorCodes } from './GCSErrorCodes.ts';
