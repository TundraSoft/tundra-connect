/**
 * The error model of `@tundraconnect/cloudflare-saas`. Every failure the
 * client throws — invalid configuration, a rejected request, a vendor error,
 * a malformed response — is a `CloudflareSaaSError`. Its readonly `code` is
 * a key of `CloudflareSaaSErrorCodes`, so you can branch on the failure
 * without matching message text, and `getContextValue()` returns diagnostic
 * context such as the HTTP `status`, Cloudflare's numeric `vendorCode`, or a
 * `retryAfterSeconds` hint. The API token never appears in an error's
 * message or context.
 *
 * @example
 * ```ts
 * import { CloudflareSaaSError } from '@tundraconnect/cloudflare-saas/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof CloudflareSaaSError && err.code === 'DUPLICATE_HOSTNAME') {
 *     // the customer's domain is already attached — look it up instead
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export {
  CloudflareSaaSError,
  type CloudflareSaaSErrorMetadata,
} from './Base.ts';
export {
  CLOUDFLARE_SAAS_TRANSIENT_CODES,
  type CloudflareSaaSErrorCode,
  CloudflareSaaSErrorCodes,
} from './CloudflareSaaSErrorCodes.ts';
