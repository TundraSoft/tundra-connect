/**
 * The error model of `@tundraconnect/cloudflare-kv`. Every failure the
 * client throws — invalid configuration, a broken Workers KV limit, a
 * rejected request, a vendor error, a malformed response — is a
 * `CloudflareKVError`. Its readonly `code` is a key of
 * `CloudflareKVErrorCodes`, so you can branch on the failure without
 * matching message text; `status` and `vendorCode` carry the HTTP status
 * and Cloudflare's numeric code, `transient` says whether retrying can
 * help, and `getContextValue()` returns further diagnostics. A 429 is a
 * `CloudflareKVRateLimitError` (a subclass) with `retryAfterSeconds`.
 * Credentials never appear in an error's message or context.
 *
 * @example
 * ```ts
 * import {
 *   CloudflareKVError,
 *   CloudflareKVRateLimitError,
 * } from '@tundraconnect/cloudflare-kv/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof CloudflareKVRateLimitError) {
 *     console.log('throttled; retry after', err.retryAfterSeconds);
 *   } else if (err instanceof CloudflareKVError && err.code === 'VALUE_TOO_LARGE') {
 *     console.log('split the value:', err.getContextValue('bytes'));
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export {
  CloudflareKVError,
  type CloudflareKVErrorMetadata,
  CloudflareKVRateLimitError,
} from './Base.ts';
export {
  CLOUDFLARE_KV_TRANSIENT_CODES,
  type CloudflareKVErrorCode,
  CloudflareKVErrorCodes,
} from './CloudflareKVErrorCodes.ts';
