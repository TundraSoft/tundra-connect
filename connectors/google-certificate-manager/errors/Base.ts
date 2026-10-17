import { RESTlerError } from '@restler';
import {
  GOOGLE_CERTIFICATE_MANAGER_TRANSIENT_CODES,
  type GoogleCertificateManagerErrorCode,
  GoogleCertificateManagerErrorCodes,
} from './GoogleCertificateManagerErrorCodes.ts';

/** Metadata supplied with a {@link GoogleCertificateManagerError}. */
export type GoogleCertificateManagerErrorMetadata = {
  vendor: string;
  originalCode?: GoogleCertificateManagerErrorCode;
} & Record<string, unknown>;

/**
 * Every failure `@tundraconnect/google-certificate-manager` throws:
 * configuration, authentication, request validation, vendor refusals,
 * transport failures, failed or unfinished long-running operations, and
 * malformed responses. Branch on {@link GoogleCertificateManagerError.code}
 * and use {@link GoogleCertificateManagerError.transient} to separate "try
 * again later" from a definite failure.
 *
 * @example
 * ```ts
 * import { GoogleCertificateManagerError } from '@tundraconnect/google-certificate-manager/errors';
 *
 * const err = new GoogleCertificateManagerError('SERVICE_UNAVAILABLE', {
 *   status: 503,
 * });
 * console.log(err.code, err.transient); // 'SERVICE_UNAVAILABLE' true
 * ```
 */
export class GoogleCertificateManagerError<
  M extends GoogleCertificateManagerErrorMetadata =
    GoogleCertificateManagerErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link GoogleCertificateManagerErrorCodes}).
   */
  public readonly code: GoogleCertificateManagerErrorCode;

  /**
   * `true` when retrying later can help — see
   * {@link GOOGLE_CERTIFICATE_MANAGER_TRANSIENT_CODES} — and `false` for a
   * definite refusal or a misconfiguration.
   */
  public readonly transient: boolean;

  protected override get _messageTemplate(): string {
    return '[google-certificate-manager] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with GoogleCertificateManager vendor metadata.
   *
   * @param code GoogleCertificateManager error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: GoogleCertificateManagerErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'GoogleCertificateManager' } as M;

    if (!GoogleCertificateManagerErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (
      const match of GoogleCertificateManagerErrorCodes[code].matchAll(
        /\$\{(\w+)\}/g,
      )
    ) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(GoogleCertificateManagerErrorCodes[code], context, cause);
    this.code = code;
    this.transient = GOOGLE_CERTIFICATE_MANAGER_TRANSIENT_CODES.has(code);
  }
}
