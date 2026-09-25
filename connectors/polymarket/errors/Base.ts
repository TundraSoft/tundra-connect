import { RESTlerError } from '@restler';
import {
  type PolymarketErrorCode,
  PolymarketErrorCodes,
} from './PolymarketErrorCodes.ts';

/** Metadata supplied with a {@link PolymarketError}. */
export type PolymarketErrorMetadata = {
  vendor: string;
  originalCode?: PolymarketErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Polymarket configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { PolymarketError } from '@tundraconnect/polymarket/errors';
 *
 * throw new PolymarketError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class PolymarketError<
  M extends PolymarketErrorMetadata = PolymarketErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link PolymarketErrorCodes}).
   */
  public readonly code: PolymarketErrorCode;

  /** Formats every message as `[polymarket] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[polymarket] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Polymarket vendor metadata.
   *
   * @param code Polymarket error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: PolymarketErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Polymarket' } as M;

    if (!PolymarketErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of PolymarketErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(PolymarketErrorCodes[code], context, cause);
    this.code = code;
  }
}
