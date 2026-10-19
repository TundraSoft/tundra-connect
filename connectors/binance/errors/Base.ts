import { RESTlerError } from '@restler';
import {
  type BinanceErrorCode,
  BinanceErrorCodes,
} from './BinanceErrorCodes.ts';

/** Metadata supplied with a {@link BinanceError}. */
export type BinanceErrorMetadata = {
  vendor: string;
  originalCode?: BinanceErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Binance configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { BinanceError } from '@tundraconnect/binance/errors';
 *
 * throw new BinanceError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class BinanceError<
  M extends BinanceErrorMetadata = BinanceErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link BinanceErrorCodes}).
   */
  public readonly code: BinanceErrorCode;

  protected override get _messageTemplate(): string {
    return '[binance] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Binance vendor metadata.
   *
   * @param code Binance error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: BinanceErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Binance' } as M;

    if (!BinanceErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of BinanceErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(BinanceErrorCodes[code], context, cause);
    this.code = code;
  }
}
