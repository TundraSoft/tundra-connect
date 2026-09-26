import { RESTlerError } from '@restler';
import { type ResendErrorCode, ResendErrorCodes } from './ResendErrorCodes.ts';

/** Metadata supplied with a {@link ResendError}. */
export type ResendErrorMetadata = {
  vendor: string;
  originalCode?: ResendErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Resend configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { ResendError } from '@tundraconnect/resend/errors';
 *
 * throw new ResendError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class ResendError<
  M extends ResendErrorMetadata = ResendErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link ResendErrorCodes}).
   */
  public readonly code: ResendErrorCode;

  protected override get _messageTemplate(): string {
    return '[resend] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Resend vendor metadata.
   *
   * @param code Resend error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: ResendErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Resend' } as M;

    if (!ResendErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of ResendErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(ResendErrorCodes[code], context, cause);
    this.code = code;
  }
}
