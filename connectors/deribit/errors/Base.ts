import { RESTlerError } from '@restler';
import {
  DERIBIT_TRANSIENT_CODES,
  type DeribitErrorCode,
  DeribitErrorCodes,
} from './DeribitErrorCodes.ts';

/** Metadata supplied with an {@link DeribitError}. */
export type DeribitErrorMetadata = {
  vendor: string;
  originalCode?: DeribitErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Deribit configuration, vendor, and response
 * failures.
 *
 * @example
 * ```ts
 * import { DeribitError } from '@tundraconnect/deribit/errors';
 *
 * throw new DeribitError('UNAUTHORIZED', { status: 401, vendorCode: 13009, vendorMessage: 'unauthorized' });
 * ```
 */
export class DeribitError<
  M extends DeribitErrorMetadata = DeribitErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link DeribitErrorCodes}). */
  public readonly code: DeribitErrorCode;

  /**
   * `true` when retrying later can help — `TIMEOUT`, `NETWORK_ERROR`,
   * `RATE_LIMITED` or `SERVICE_UNAVAILABLE` (see
   * {@link DERIBIT_TRANSIENT_CODES}) — and `false` for a definite
   * refusal or a misconfiguration.
   */
  public readonly transient: boolean;

  /** Formats every message as `[Deribit] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[Deribit] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Deribit vendor metadata.
   *
   * @param code Deribit error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: DeribitErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Deribit' } as M;

    if (!DeribitErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (
      const match of DeribitErrorCodes[code].matchAll(/\$\{(\w+)\}/g)
    ) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(DeribitErrorCodes[code], context, cause);
    this.code = code;
    this.transient = DERIBIT_TRANSIENT_CODES.has(code);
  }
}
