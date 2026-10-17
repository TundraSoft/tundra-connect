/**
 * The error model of `@tundraconnect/google-certificate-manager`. Every
 * failure the client throws is a `GoogleCertificateManagerError`. Its
 * readonly `code` is a key of `GoogleCertificateManagerErrorCodes`, so you can
 * branch on the failure without matching message text; `transient` says
 * whether retrying later can help; and `getContextValue()` returns
 * diagnostic context such as the HTTP `status`, Google's `vendorStatus` and
 * `detail`, or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { GoogleCertificateManagerError } from '@tundraconnect/google-certificate-manager/errors';
 *
 * declare function createCertificate(): Promise<unknown>;
 *
 * try {
 *   await createCertificate();
 * } catch (err) {
 *   if (err instanceof GoogleCertificateManagerError && err.code === 'ALREADY_EXISTS') {
 *     // A retry after a lost answer: the certificate is already there.
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */
export {
  GoogleCertificateManagerError,
  type GoogleCertificateManagerErrorMetadata,
} from './Base.ts';
export {
  GOOGLE_CERTIFICATE_MANAGER_TRANSIENT_CODES,
  type GoogleCertificateManagerErrorCode,
  GoogleCertificateManagerErrorCodes,
} from './GoogleCertificateManagerErrorCodes.ts';
