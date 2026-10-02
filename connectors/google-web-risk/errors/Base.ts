import { RESTlerError } from '@restler';
import {
  GOOGLE_WEB_RISK_TRANSIENT_CODES,
  type GoogleWebRiskErrorCode,
  GoogleWebRiskErrorCodes,
} from './GoogleWebRiskErrorCodes.ts';

/** Metadata supplied with a {@link GoogleWebRiskError}. */
export type GoogleWebRiskErrorMetadata = {
  vendor: string;
  originalCode?: GoogleWebRiskErrorCode;
} & Record<string, unknown>;

/**
 * The one error class `@tundraconnect/google-web-risk` throws — for
 * configuration, request-validation, vendor, transport and response
 * failures alike. Branch on {@link GoogleWebRiskError.code}, or on
 * {@link GoogleWebRiskError.transient} to separate "no verdict yet" from a
 * definite failure.
 *
 * @example
 * ```ts
 * import { GoogleWebRiskError } from '@tundraconnect/google-web-risk/errors';
 *
 * const err = new GoogleWebRiskError('SERVICE_UNAVAILABLE', { status: 503 });
 * console.log(err.code, err.transient); // 'SERVICE_UNAVAILABLE' true
 * ```
 */
export class GoogleWebRiskError<
  M extends GoogleWebRiskErrorMetadata = GoogleWebRiskErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link GoogleWebRiskErrorCodes}).
   */
  public readonly code: GoogleWebRiskErrorCode;

  /**
   * `true` when the failure means "no verdict yet, ask again later" —
   * `TIMEOUT`, `NETWORK_ERROR`, `SERVICE_UNAVAILABLE` or `RATE_LIMITED` —
   * rather than a definite answer or a configuration problem that retrying
   * will not fix.
   */
  public readonly transient: boolean;

  protected override get _messageTemplate(): string {
    return '[google-web-risk] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with GoogleWebRisk vendor metadata.
   *
   * @param code GoogleWebRisk error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: GoogleWebRiskErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'GoogleWebRisk' } as M;

    if (!GoogleWebRiskErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (
      const match of GoogleWebRiskErrorCodes[code].matchAll(/\$\{(\w+)\}/g)
    ) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(GoogleWebRiskErrorCodes[code], context, cause);
    this.code = code;
    this.transient = GOOGLE_WEB_RISK_TRANSIENT_CODES.has(code);
  }
}
