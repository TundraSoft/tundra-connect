import { RESTlerError } from '@restler';
import { type SentryErrorCode, SentryErrorCodes } from './SentryErrorCodes.ts';

/** Metadata supplied with a {@link SentryError}. */
export type SentryErrorMetadata = {
  vendor: string;
  originalCode?: SentryErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Sentry configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { SentryError } from '@tundraconnect/sentry/errors';
 *
 * throw new SentryError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class SentryError<
  M extends SentryErrorMetadata = SentryErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link SentryErrorCodes}).
   */
  public readonly code: SentryErrorCode;

  protected override get _messageTemplate(): string {
    return '[sentry] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Sentry vendor metadata.
   *
   * @param code Sentry error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: SentryErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Sentry' } as M;

    if (!SentryErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of SentryErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(SentryErrorCodes[code], context, cause);
    this.code = code;
  }
}
