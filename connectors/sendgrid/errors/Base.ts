import { RESTlerError } from '@restler';
import {
  type SendGridErrorCode,
  SendGridErrorCodes,
} from './SendGridErrorCodes.ts';

/** Metadata supplied with a {@link SendGridError}. */
export type SendGridErrorMetadata = {
  vendor: string;
  originalCode?: SendGridErrorCode;
} & Record<string, unknown>;

/**
 * Base error for SendGrid configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { SendGridError } from '@tundraconnect/sendgrid/errors';
 *
 * throw new SendGridError('AUTH_REQUIRED', { status: 401 });
 * ```
 */
export class SendGridError<
  M extends SendGridErrorMetadata = SendGridErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link SendGridErrorCodes}). */
  public readonly code: SendGridErrorCode;

  /** Formats every message as `[SendGrid] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[SendGrid] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with SendGrid vendor metadata.
   *
   * @param code SendGrid error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: SendGridErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'SendGrid' } as M;

    if (!SendGridErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of SendGridErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(SendGridErrorCodes[code], context, cause);
    this.code = code;
  }
}
