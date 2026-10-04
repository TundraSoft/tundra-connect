import { RESTlerError } from '@restler';
import {
  CLOUDFLARE_DNS_TRANSIENT_CODES,
  type CloudflareDNSErrorCode,
  CloudflareDNSErrorCodes,
} from './CloudflareDNSErrorCodes.ts';

/** Metadata supplied with a {@link CloudflareDNSError}. */
export type CloudflareDNSErrorMetadata = {
  vendor: string;
  originalCode?: CloudflareDNSErrorCode;
} & Record<string, unknown>;

/**
 * Base error for CloudflareDNS configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { CloudflareDNSError } from '@tundraconnect/cloudflare-dns/errors';
 *
 * throw new CloudflareDNSError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class CloudflareDNSError<
  M extends CloudflareDNSErrorMetadata = CloudflareDNSErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link CloudflareDNSErrorCodes}).
   */
  public readonly code: CloudflareDNSErrorCode;

  /**
   * `true` when retrying later can help — `TIMEOUT`, `NETWORK_ERROR`,
   * `SERVICE_UNAVAILABLE` or `RATE_LIMITED` (see
   * {@link CLOUDFLARE_DNS_TRANSIENT_CODES}) — and `false` for a definite refusal
   * or a misconfiguration.
   */
  public readonly transient: boolean;

  /** Formats every message as `[cloudflare-dns] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[cloudflare-dns] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with CloudflareDNS vendor metadata.
   *
   * @param code CloudflareDNS error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: CloudflareDNSErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'CloudflareDNS' } as M;

    if (!CloudflareDNSErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (
      const match of CloudflareDNSErrorCodes[code].matchAll(/\$\{(\w+)\}/g)
    ) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(CloudflareDNSErrorCodes[code], context, cause);
    this.code = code;
    this.transient = CLOUDFLARE_DNS_TRANSIENT_CODES.has(code);
  }
}
