import { RESTlerError } from '@restler';
import {
  CLOUDFLARE_TURNSTILE_TRANSIENT_CODES,
  type CloudflareTurnstileErrorCode,
  CloudflareTurnstileErrorCodes,
} from './CloudflareTurnstileErrorCodes.ts';

/** Metadata supplied with a {@link CloudflareTurnstileError}. */
export type CloudflareTurnstileErrorMetadata = {
  vendor: string;
  originalCode?: CloudflareTurnstileErrorCode;
} & Record<string, unknown>;

/**
 * The one error class `@tundraconnect/cloudflare-turnstile` throws — for
 * configuration, request-validation, vendor, transport and response
 * failures alike. Branch on {@link CloudflareTurnstileError.code}, or on
 * {@link CloudflareTurnstileError.transient} to separate "no verdict yet"
 * from a definite failure. A failed challenge is NOT an error: `verify`
 * resolves it as `success: false`.
 *
 * @example
 * ```ts
 * import { CloudflareTurnstileError } from '@tundraconnect/cloudflare-turnstile/errors';
 *
 * const err = new CloudflareTurnstileError('SERVICE_UNAVAILABLE', { status: 503 });
 * console.log(err.code, err.transient); // 'SERVICE_UNAVAILABLE' true
 * ```
 */
export class CloudflareTurnstileError<
  M extends CloudflareTurnstileErrorMetadata = CloudflareTurnstileErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link CloudflareTurnstileErrorCodes}).
   */
  public readonly code: CloudflareTurnstileErrorCode;

  /**
   * `true` when the failure means "no verdict yet, try again" —
   * `TIMEOUT`, `NETWORK_ERROR`, `SERVICE_UNAVAILABLE` or `RATE_LIMITED` —
   * rather than a definite answer or a problem retrying will not fix.
   */
  public readonly transient: boolean;

  /** Formats every message as `[cloudflare-turnstile] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[cloudflare-turnstile] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with CloudflareTurnstile vendor metadata.
   *
   * @param code CloudflareTurnstile error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: CloudflareTurnstileErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'CloudflareTurnstile' } as M;

    if (!CloudflareTurnstileErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (
      const match of CloudflareTurnstileErrorCodes[code].matchAll(
        /\$\{(\w+)\}/g,
      )
    ) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(CloudflareTurnstileErrorCodes[code], context, cause);
    this.code = code;
    this.transient = CLOUDFLARE_TURNSTILE_TRANSIENT_CODES.has(code);
  }
}
