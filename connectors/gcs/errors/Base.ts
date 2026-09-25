import { RESTlerError } from '@restler';
import { type GCSErrorCode, GCSErrorCodes } from './GCSErrorCodes.ts';

/** Metadata supplied with a {@link GCSError}. */
export type GCSErrorMetadata = {
  vendor: string;
  originalCode?: GCSErrorCode;
} & Record<string, unknown>;

/**
 * Base error for GCS configuration, authentication, and response failures.
 *
 * @example
 * ```ts
 * import { GCSError } from '@tundraconnect/gcs/errors';
 *
 * throw new GCSError('NOT_FOUND', { status: 404 });
 * ```
 */
export class GCSError<
  M extends GCSErrorMetadata = GCSErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link GCSErrorCodes}). */
  public readonly code: GCSErrorCode;

  /** Formats every message as `[GCS] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[GCS] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with GCS vendor metadata.
   *
   * @param code GCS error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: GCSErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'GCS' } as M;

    if (!GCSErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of GCSErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(GCSErrorCodes[code], context, cause);
    this.code = code;
  }
}
