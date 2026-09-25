/**
 * The error model of `@tundraconnect/algolia`. Every failure the client throws
 * — invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `AlgoliaError`. Its readonly `code` is a key of
 * `AlgoliaErrorCodes`, so you can branch on the failure without matching
 * message text, and `getContextValue()` returns diagnostic context such as the
 * HTTP `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { AlgoliaError } from '@tundraconnect/algolia/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof AlgoliaError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { AlgoliaError, type AlgoliaErrorMetadata } from './Base.ts';
export {
  type AlgoliaErrorCode,
  AlgoliaErrorCodes,
} from './AlgoliaErrorCodes.ts';
