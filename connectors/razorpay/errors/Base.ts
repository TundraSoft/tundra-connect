import { RESTlerError } from '@restler';
import {
  type RazorpayErrorCode,
  RazorpayErrorCodes,
} from './RazorpayErrorCodes.ts';

/** Metadata supplied with a {@link RazorpayError}. */
export type RazorpayErrorMetadata = {
  vendor: string;
  originalCode?: RazorpayErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Razorpay configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { RazorpayError } from '@tundraconnect/razorpay/errors';
 *
 * throw new RazorpayError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class RazorpayError<
  M extends RazorpayErrorMetadata = RazorpayErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link RazorpayErrorCodes}).
   */
  public readonly code: RazorpayErrorCode;

  /** Formats every message as `[razorpay] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[razorpay] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Razorpay vendor metadata.
   *
   * @param code Razorpay error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: RazorpayErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Razorpay' } as M;

    if (!RazorpayErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of RazorpayErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(RazorpayErrorCodes[code], context, cause);
    this.code = code;
  }
}
