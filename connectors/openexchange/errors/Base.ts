import { RESTlerError } from '@restler';
import {
  type OpenExchangeErrorCode,
  OpenExchangeErrorCodes,
} from './OpenExchangeErrorCodes.ts';

/** Metadata supplied with an {@link OpenExchangeError}. */
export type OpenExchangeErrorMetadata = {
  vendor: string;
  originalCode?: OpenExchangeErrorCode;
} & Record<string, unknown>;

/**
 * Base error for OpenExchange configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { OpenExchangeError } from '@tundraconnect/openexchange/errors';
 *
 * throw new OpenExchangeError('INVALID_APP_ID');
 * ```
 */
export class OpenExchangeError<
  M extends OpenExchangeErrorMetadata = OpenExchangeErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link OpenExchangeErrorCodes}). */
  public readonly code: OpenExchangeErrorCode;

  protected override get _messageTemplate(): string {
    return '[OpenExchange] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with OpenExchange vendor metadata.
   *
   * @param code OpenExchange error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: OpenExchangeErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'OpenExchange' } as M;

    if (!OpenExchangeErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of OpenExchangeErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(OpenExchangeErrorCodes[code], context, cause);
    this.code = code;
  }
}
