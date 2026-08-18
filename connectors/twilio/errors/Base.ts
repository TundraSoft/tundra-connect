import { RESTlerError } from '@restler';
import { type TwilioErrorCode, TwilioErrorCodes } from './TwilioErrorCodes.ts';

/** Metadata supplied with a {@link TwilioError}. */
export type TwilioErrorMetadata = {
  vendor: string;
  originalCode?: TwilioErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Twilio configuration, request-validation, and vendor
 * response failures.
 *
 * @example
 * ```ts
 * import { TwilioError } from '@tundraconnect/twilio/errors';
 *
 * throw new TwilioError('INVALID_TO_NUMBER', { to: '123' });
 * ```
 */
export class TwilioError<
  M extends TwilioErrorMetadata = TwilioErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link TwilioErrorCodes}). */
  public readonly code: TwilioErrorCode;

  protected override get _messageTemplate(): string {
    return '[Twilio] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Twilio vendor metadata.
   *
   * @param code Twilio error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: TwilioErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Twilio' } as M;

    if (!TwilioErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of TwilioErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(TwilioErrorCodes[code], context, cause);
    this.code = code;
  }
}
