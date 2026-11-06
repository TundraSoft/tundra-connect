import { RESTlerError } from '@restler';
import {
  EIA_TRANSIENT_CODES,
  type EIAErrorCode,
  EIAErrorCodes,
} from './EIAErrorCodes.ts';

/** Metadata supplied with an {@link EIAError}. */
export type EIAErrorMetadata = {
  vendor: string;
  originalCode?: EIAErrorCode;
} & Record<string, unknown>;

/**
 * Base error for EIA configuration, vendor, and response
 * failures.
 *
 * @example
 * ```ts
 * import { EIAError } from '@tundraconnect/eia/errors';
 *
 * throw new EIAError('INVALID_API_KEY', { status: 401 });
 * ```
 */
export class EIAError<
  M extends EIAErrorMetadata = EIAErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link EIAErrorCodes}). */
  public readonly code: EIAErrorCode;

  /**
   * `true` when retrying later can help — `TIMEOUT`, `NETWORK_ERROR`,
   * `RATE_LIMITED` or `SERVICE_UNAVAILABLE` (see
   * {@link EIA_TRANSIENT_CODES}) — and `false` for a definite
   * refusal or a misconfiguration.
   */
  public readonly transient: boolean;

  /** Formats every message as `[EIA] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[EIA] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with EIA vendor metadata.
   *
   * @param code EIA error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: EIAErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'EIA' } as M;

    if (!EIAErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (
      const match of EIAErrorCodes[code].matchAll(/\$\{(\w+)\}/g)
    ) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(EIAErrorCodes[code], context, cause);
    this.code = code;
    this.transient = EIA_TRANSIENT_CODES.has(code);
  }
}
