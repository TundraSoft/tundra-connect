import { RESTlerError } from '@restler';
import { type PayPalErrorCode, PayPalErrorCodes } from './PayPalErrorCodes.ts';

/** Metadata supplied with a {@link PayPalError}. */
export type PayPalErrorMetadata = {
  vendor: string;
  originalCode?: PayPalErrorCode;
} & Record<string, unknown>;

/**
 * Base error for PayPal configuration, authentication, and response
 * failures.
 *
 * @example
 * ```ts
 * import { PayPalError } from '@tundraconnect/paypal/errors';
 *
 * throw new PayPalError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class PayPalError<
  M extends PayPalErrorMetadata = PayPalErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link PayPalErrorCodes}).
   */
  public readonly code: PayPalErrorCode;

  /** Formats every message as `[PayPal] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[PayPal] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with PayPal vendor metadata.
   *
   * @param code PayPal error code.
   * @param meta Additional diagnostic metadata. Never pass `clientSecret`
   * here — this connect must never place a credential value into an
   * error's context.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: PayPalErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'PayPal' } as M;

    if (!PayPalErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of PayPalErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(PayPalErrorCodes[code], context, cause);
    this.code = code;
  }
}
