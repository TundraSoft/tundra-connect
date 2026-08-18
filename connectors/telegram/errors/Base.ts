import { RESTlerError } from '@restler';
import {
  type TelegramErrorCode,
  TelegramErrorCodes,
} from './TelegramErrorCodes.ts';

/** Metadata supplied with a {@link TelegramError}. */
export type TelegramErrorMetadata = {
  vendor: string;
  originalCode?: TelegramErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Telegram configuration, local-validation, and vendor
 * response failures.
 *
 * @example
 * ```ts
 * import { TelegramError } from '@tundraconnect/telegram/errors';
 *
 * throw new TelegramError('AUTH_FAILED', { status: 401 });
 * ```
 */
export class TelegramError<
  M extends TelegramErrorMetadata = TelegramErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link TelegramErrorCodes}). */
  public readonly code: TelegramErrorCode;

  protected override get _messageTemplate(): string {
    return '[Telegram] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Telegram vendor metadata.
   *
   * @param code Telegram error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: TelegramErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Telegram' } as M;

    if (!TelegramErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of TelegramErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(TelegramErrorCodes[code], context, cause);
    this.code = code;
  }
}
