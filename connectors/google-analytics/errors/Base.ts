import { RESTlerError } from '@restler';
import {
  GOOGLE_ANALYTICS_TRANSIENT_CODES,
  type GoogleAnalyticsErrorCode,
  GoogleAnalyticsErrorCodes,
} from './GoogleAnalyticsErrorCodes.ts';

/** Metadata supplied with a {@link GoogleAnalyticsError}. */
export type GoogleAnalyticsErrorMetadata = {
  vendor: string;
  originalCode?: GoogleAnalyticsErrorCode;
} & Record<string, unknown>;

/**
 * The one error class `@tundraconnect/google-analytics` throws — for
 * configuration, local validation, HTTP refusals, transport failures and
 * malformed debug responses alike.
 *
 * @example
 * ```ts
 * import { GoogleAnalyticsError } from '@tundraconnect/google-analytics/errors';
 *
 * const err = new GoogleAnalyticsError('SERVICE_UNAVAILABLE', { status: 503 });
 * console.log(err.code, err.transient); // 'SERVICE_UNAVAILABLE' true
 * ```
 */
export class GoogleAnalyticsError<
  M extends GoogleAnalyticsErrorMetadata = GoogleAnalyticsErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link GoogleAnalyticsErrorCodes}).
   */
  public readonly code: GoogleAnalyticsErrorCode;

  /**
   * `true` when retrying later can help — `TIMEOUT`, `NETWORK_ERROR`,
   * `SERVICE_UNAVAILABLE` or `RATE_LIMITED` (see
   * {@link GOOGLE_ANALYTICS_TRANSIENT_CODES}) — and `false` for a definite
   * refusal or a misconfiguration.
   */
  public readonly transient: boolean;

  /** Formats every message as `[google-analytics] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[google-analytics] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with GoogleAnalytics vendor metadata.
   *
   * @param code GoogleAnalytics error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: GoogleAnalyticsErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'GoogleAnalytics' } as M;

    if (!GoogleAnalyticsErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}'.
    for (
      const match of GoogleAnalyticsErrorCodes[code].matchAll(/\$\{(\w+)\}/g)
    ) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(GoogleAnalyticsErrorCodes[code], context, cause);
    this.code = code;
    this.transient = GOOGLE_ANALYTICS_TRANSIENT_CODES.has(code);
  }
}
