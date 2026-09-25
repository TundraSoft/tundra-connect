/**
 * The error model of `@tundraconnect/azure-blob`. Every failure the client
 * throws — invalid configuration, a rejected request, a vendor error, a
 * malformed response — is an `AzureBlobError`. Its readonly `code` is a key of
 * `AzureBlobErrorCodes`, so you can branch on the failure without matching
 * message text, and `getContextValue()` returns diagnostic context such as the
 * HTTP `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { AzureBlobError } from '@tundraconnect/azure-blob/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof AzureBlobError && err.code === 'SERVER_BUSY') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { AzureBlobError, type AzureBlobErrorMetadata } from './Base.ts';
export {
  type AzureBlobErrorCode,
  AzureBlobErrorCodes,
} from './AzureBlobErrorCodes.ts';
