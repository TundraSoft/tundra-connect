import { RESTlerError } from '@restler';
import {
  type CoinGeckoErrorCode,
  CoinGeckoErrorCodes,
} from './CoinGeckoErrorCodes.ts';

/** Metadata supplied with a {@link CoinGeckoError}. */
export type CoinGeckoErrorMetadata = {
  vendor: string;
  originalCode?: CoinGeckoErrorCode;
} & Record<string, unknown>;

/**
 * Base error for CoinGecko configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { CoinGeckoError } from '@tundraconnect/coingecko/errors';
 *
 * throw new CoinGeckoError('NOT_FOUND', { status: 404 });
 * ```
 */
export class CoinGeckoError<
  M extends CoinGeckoErrorMetadata = CoinGeckoErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link CoinGeckoErrorCodes}). */
  public readonly code: CoinGeckoErrorCode;

  /** Formats every message as `[CoinGecko] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[CoinGecko] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with CoinGecko vendor metadata.
   *
   * @param code CoinGecko error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: CoinGeckoErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'CoinGecko' } as M;

    if (!CoinGeckoErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }
    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of CoinGeckoErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(CoinGeckoErrorCodes[code], context, cause);
    this.code = code;
  }
}
