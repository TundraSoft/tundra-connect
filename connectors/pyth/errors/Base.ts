import { RESTlerError } from '@restler';
import { type PythErrorCode, PythErrorCodes } from './PythErrorCodes.ts';

/** Metadata supplied with a {@link PythError}. */
export type PythErrorMetadata = {
  vendor: string;
  originalCode?: PythErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Pyth configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { PythError } from '@tundraconnect/pyth/errors';
 *
 * throw new PythError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class PythError<
  M extends PythErrorMetadata = PythErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link PythErrorCodes}).
   */
  public readonly code: PythErrorCode;

  protected override get _messageTemplate(): string {
    return '[pyth] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Pyth vendor metadata.
   *
   * @param code Pyth error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: PythErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Pyth' } as M;

    if (!PythErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of PythErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(PythErrorCodes[code], context, cause);
    this.code = code;
  }
}
