import { RESTlerError } from '@restler';
import {
  URLHAUS_TRANSIENT_CODES,
  type URLhausErrorCode,
  URLhausErrorCodes,
} from './URLhausErrorCodes.ts';

/** Metadata supplied with a {@link URLhausError}. */
export type URLhausErrorMetadata = {
  vendor: string;
  originalCode?: URLhausErrorCode;
} & Record<string, unknown>;

/**
 * The one error class `@tundraconnect/urlhaus` throws — for configuration,
 * request-validation, vendor, transport and response failures alike. Branch
 * on {@link URLhausError.code}, or on {@link URLhausError.transient} to
 * separate "no verdict yet" from a definite failure.
 *
 * @example
 * ```ts
 * import { URLhausError } from '@tundraconnect/urlhaus/errors';
 *
 * const err = new URLhausError('SERVICE_UNAVAILABLE', { status: 503 });
 * console.log(err.code, err.transient); // 'SERVICE_UNAVAILABLE' true
 * ```
 */
export class URLhausError<
  M extends URLhausErrorMetadata = URLhausErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link URLhausErrorCodes}).
   */
  public readonly code: URLhausErrorCode;

  /**
   * `true` when the failure means "no verdict yet, ask again later" —
   * `TIMEOUT`, `NETWORK_ERROR`, `SERVICE_UNAVAILABLE` or `RATE_LIMITED` —
   * rather than a definite answer or a problem retrying will not fix.
   */
  public readonly transient: boolean;

  protected override get _messageTemplate(): string {
    return '[urlhaus] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with URLhaus vendor metadata.
   *
   * @param code URLhaus error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: URLhausErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'URLhaus' } as M;

    if (!URLhausErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of URLhausErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(URLhausErrorCodes[code], context, cause);
    this.code = code;
    this.transient = URLHAUS_TRANSIENT_CODES.has(code);
  }
}
