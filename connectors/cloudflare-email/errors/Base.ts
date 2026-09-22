import { RESTlerError } from '@restler';
import {
  type CloudflareEmailErrorCode,
  CloudflareEmailErrorCodes,
} from './CloudflareEmailErrorCodes.ts';

/** Metadata supplied with a {@link CloudflareEmailError}. */
export type CloudflareEmailErrorMetadata = {
  vendor: string;
  originalCode?: CloudflareEmailErrorCode;
} & Record<string, unknown>;

/**
 * Base error for CloudflareEmail configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { CloudflareEmailError } from '@tundraconnect/cloudflare-email/errors';
 *
 * throw new CloudflareEmailError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class CloudflareEmailError<
  M extends CloudflareEmailErrorMetadata = CloudflareEmailErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link CloudflareEmailErrorCodes}).
   */
  public readonly code: CloudflareEmailErrorCode;

  protected override get _messageTemplate(): string {
    return '[cloudflare-email] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with CloudflareEmail vendor metadata.
   *
   * @param code CloudflareEmail error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: CloudflareEmailErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'CloudflareEmail' } as M;

    if (!CloudflareEmailErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (
      const match of CloudflareEmailErrorCodes[code].matchAll(/\$\{(\w+)\}/g)
    ) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(CloudflareEmailErrorCodes[code], context, cause);
    this.code = code;
  }
}
