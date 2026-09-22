import { RESTlerError } from '@restler';
import { type KalshiErrorCode, KalshiErrorCodes } from './KalshiErrorCodes.ts';

/** Metadata supplied with a {@link KalshiError}. */
export type KalshiErrorMetadata = {
  vendor: string;
  originalCode?: KalshiErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Kalshi configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { KalshiError } from '@tundraconnect/kalshi/errors';
 *
 * throw new KalshiError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class KalshiError<
  M extends KalshiErrorMetadata = KalshiErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link KalshiErrorCodes}).
   */
  public readonly code: KalshiErrorCode;

  protected override get _messageTemplate(): string {
    return '[kalshi] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Kalshi vendor metadata.
   *
   * @param code Kalshi error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: KalshiErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Kalshi' } as M;

    if (!KalshiErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of KalshiErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(KalshiErrorCodes[code], context, cause);
    this.code = code;
  }
}
