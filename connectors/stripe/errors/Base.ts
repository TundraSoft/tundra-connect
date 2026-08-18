import { RESTlerError } from '@restler';
import { type StripeErrorCode, StripeErrorCodes } from './StripeErrorCodes.ts';

/** Metadata supplied with a {@link StripeError}. */
export type StripeErrorMetadata = {
  vendor: string;
  originalCode?: StripeErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Stripe configuration, request-validation, and vendor
 * response failures.
 *
 * @example
 * ```ts
 * import { StripeError } from '@tundraconnect/stripe/errors';
 *
 * throw new StripeError('CARD_DECLINED', { vendorMessage: 'Your card was declined.' });
 * ```
 */
export class StripeError<
  M extends StripeErrorMetadata = StripeErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link StripeErrorCodes}). */
  public readonly code: StripeErrorCode;

  protected override get _messageTemplate(): string {
    return '[Stripe] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Stripe vendor metadata.
   *
   * @param code Stripe error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: StripeErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Stripe' } as M;

    if (!StripeErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of StripeErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(StripeErrorCodes[code], context, cause);
    this.code = code;
  }
}
