/**
 * The error model of `@tundraconnect/cloudflare-dns`. Every failure the
 * client throws — invalid configuration, a rejected request, a vendor error,
 * a malformed response — is a `CloudflareDNSError`. Its readonly `code` is a
 * key of `CloudflareDNSErrorCodes`, so you can branch on the failure without
 * matching message text, and `getContextValue()` returns diagnostic context
 * such as the HTTP `status`, Cloudflare's numeric `vendorCode`, or a
 * `retryAfterSeconds` hint. The API token never appears in an error's
 * message or context.
 *
 * @example
 * ```ts
 * import { CloudflareDNSError } from '@tundraconnect/cloudflare-dns/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof CloudflareDNSError && err.code === 'RECORD_CONFLICT') {
 *     console.log('already there:', err.getContextValue('detail'));
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { CloudflareDNSError, type CloudflareDNSErrorMetadata } from './Base.ts';
export {
  CLOUDFLARE_DNS_TRANSIENT_CODES,
  type CloudflareDNSErrorCode,
  CloudflareDNSErrorCodes,
} from './CloudflareDNSErrorCodes.ts';
