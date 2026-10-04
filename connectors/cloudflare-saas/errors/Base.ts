import { RESTlerError } from '@restler';
import {
  CLOUDFLARE_SAAS_TRANSIENT_CODES,
  type CloudflareSaaSErrorCode,
  CloudflareSaaSErrorCodes,
} from './CloudflareSaaSErrorCodes.ts';

/** Metadata supplied with a {@link CloudflareSaaSError}. */
export type CloudflareSaaSErrorMetadata = {
  vendor: string;
  originalCode?: CloudflareSaaSErrorCode;
} & Record<string, unknown>;

/**
 * Base error for CloudflareSaaS configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { CloudflareSaaSError } from '@tundraconnect/cloudflare-saas/errors';
 *
 * throw new CloudflareSaaSError('QUOTA_EXCEEDED', { status: 403 });
 * ```
 */
export class CloudflareSaaSError<
  M extends CloudflareSaaSErrorMetadata = CloudflareSaaSErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link CloudflareSaaSErrorCodes}).
   */
  public readonly code: CloudflareSaaSErrorCode;

  /**
   * `true` when retrying later can help — `TIMEOUT`, `NETWORK_ERROR`,
   * `SERVICE_UNAVAILABLE` or `RATE_LIMITED` (see
   * {@link CLOUDFLARE_SAAS_TRANSIENT_CODES}) — and `false` for a definite refusal
   * or a misconfiguration.
   */
  public readonly transient: boolean;

  /** Formats every message as `[cloudflare-saas] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[cloudflare-saas] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with CloudflareSaaS vendor metadata.
   *
   * @param code CloudflareSaaS error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: CloudflareSaaSErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'CloudflareSaaS' } as M;

    if (!CloudflareSaaSErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (
      const match of CloudflareSaaSErrorCodes[code].matchAll(/\$\{(\w+)\}/g)
    ) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(CloudflareSaaSErrorCodes[code], context, cause);
    this.code = code;
    this.transient = CLOUDFLARE_SAAS_TRANSIENT_CODES.has(code);
  }
}
