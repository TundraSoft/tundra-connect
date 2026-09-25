/**
 * The error model of `@tundraconnect/s3`. Every failure the client throws —
 * invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `S3Error`. Its readonly `code` is a key of `S3ErrorCodes`,
 * so you can branch on the failure without matching message text, and
 * `getContextValue()` returns diagnostic context such as the HTTP `status` or a
 * `retryAfterSeconds` hint. Credentials never appear in an error's message or
 * context.
 *
 * @example
 * ```ts
 * import { S3Error } from '@tundraconnect/s3/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof S3Error && err.code === 'SLOW_DOWN') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { S3Error, type S3ErrorMetadata } from './Base.ts';
export { type S3ErrorCode, S3ErrorCodes } from './S3ErrorCodes.ts';
