import { RESTlerError } from '@restler';
import {
  CLOUDFLARE_KV_TRANSIENT_CODES,
  type CloudflareKVErrorCode,
  CloudflareKVErrorCodes,
} from './CloudflareKVErrorCodes.ts';

/** Metadata supplied with a {@link CloudflareKVError}. */
export type CloudflareKVErrorMetadata = {
  vendor: string;
  originalCode?: CloudflareKVErrorCode;
} & Record<string, unknown>;

/**
 * Base error for CloudflareKV configuration, validation, vendor and
 * response failures.
 *
 * @example
 * ```ts
 * import { CloudflareKVError } from '@tundraconnect/cloudflare-kv/errors';
 *
 * throw new CloudflareKVError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class CloudflareKVError<
  M extends CloudflareKVErrorMetadata = CloudflareKVErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link CloudflareKVErrorCodes}).
   */
  public readonly code: CloudflareKVErrorCode;

  /**
   * `true` when retrying later can help — `TIMEOUT`, `NETWORK_ERROR`,
   * `SERVICE_UNAVAILABLE` or `RATE_LIMITED` (see
   * {@link CLOUDFLARE_KV_TRANSIENT_CODES}) — and `false` for a definite
   * refusal, a broken limit or a misconfiguration.
   */
  public readonly transient: boolean;

  /** HTTP status Cloudflare answered with, when there was a response. */
  public readonly status: number | undefined;

  /** Cloudflare's own numeric error code (`errors[0].code`), when given. */
  public readonly vendorCode: number | undefined;

  /** Formats every message as `[cloudflare-kv] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[cloudflare-kv] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with CloudflareKV vendor metadata.
   *
   * @param code CloudflareKV error code.
   * @param meta Additional diagnostic metadata. `status` and `vendorCode`
   * are also surfaced as properties.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: CloudflareKVErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'CloudflareKV' } as M;

    if (!CloudflareKVErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (
      const match of CloudflareKVErrorCodes[code].matchAll(/\$\{(\w+)\}/g)
    ) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(CloudflareKVErrorCodes[code], context, cause);
    this.code = code;
    this.transient = CLOUDFLARE_KV_TRANSIENT_CODES.has(code);
    const status = (context as Record<string, unknown>).status;
    this.status = typeof status === 'number' ? status : undefined;
    const vendorCode = (context as Record<string, unknown>).vendorCode;
    this.vendorCode = typeof vendorCode === 'number' ? vendorCode : undefined;
  }
}

/**
 * Cloudflare throttled the call (HTTP 429) and the client's retries — if
 * any were configured — did not get past it. Always `code: 'RATE_LIMITED'`
 * and `transient: true`; its own class so a caller can `instanceof` it
 * apart from every other failure.
 *
 * @example
 * ```ts
 * import { CloudflareKVRateLimitError } from '@tundraconnect/cloudflare-kv/errors';
 *
 * declare function write(): Promise<void>;
 *
 * try {
 *   await write();
 * } catch (err) {
 *   if (err instanceof CloudflareKVRateLimitError) {
 *     console.log('back off for', err.retryAfterSeconds ?? 'an unknown time');
 *   }
 *   throw err;
 * }
 * ```
 */
export class CloudflareKVRateLimitError extends CloudflareKVError {
  /**
   * Seconds Cloudflare asked the client to wait (`Retry-After`), when the
   * response carried a readable hint.
   */
  public readonly retryAfterSeconds: number | undefined;

  /**
   * Creates a rate-limit error.
   *
   * @param meta Diagnostic metadata; `retryAfterSeconds` is surfaced as a
   * property.
   * @param cause Underlying error, when available.
   */
  constructor(
    meta?: Omit<CloudflareKVErrorMetadata, 'vendor'>,
    cause?: Error,
  ) {
    super('RATE_LIMITED', { status: 429, ...meta }, cause);
    const retryAfter = meta?.retryAfterSeconds;
    this.retryAfterSeconds = typeof retryAfter === 'number'
      ? retryAfter
      : undefined;
  }
}
