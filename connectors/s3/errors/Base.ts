import { RESTlerError } from '@restler';
import { type S3ErrorCode, S3ErrorCodes } from './S3ErrorCodes.ts';

/** Metadata supplied with an {@link S3Error}. */
export type S3ErrorMetadata = {
  vendor: string;
  originalCode?: S3ErrorCode;
} & Record<string, unknown>;

/**
 * Base error for S3 configuration, signing, vendor, and response
 * validation failures. One class for the whole connect — the
 * {@link S3ErrorCodes} registry is the extension point, not the class
 * hierarchy.
 *
 * @example
 * ```ts
 * import { S3Error } from '@tundraconnect/s3/errors';
 *
 * throw new S3Error('NO_SUCH_KEY', { key: 'missing.txt' });
 * ```
 */
export class S3Error<
  M extends S3ErrorMetadata = S3ErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link S3ErrorCodes}). */
  public readonly code: S3ErrorCode;

  protected override get _messageTemplate(): string {
    return '[S3] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with S3 vendor metadata.
   *
   * @param code S3 error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: S3ErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'S3' } as M;

    if (!S3ErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of S3ErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(S3ErrorCodes[code], context, cause);
    this.code = code;
  }
}
