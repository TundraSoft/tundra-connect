import { RESTlerError } from '@restler';
import { type NtfyErrorCode, NtfyErrorCodes } from './NtfyErrorCodes.ts';

/** Metadata supplied with a {@link NtfyError}. */
export type NtfyErrorMetadata = {
  vendor: string;
  originalCode?: NtfyErrorCode;
} & Record<string, unknown>;

/**
 * Base error for ntfy configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { NtfyError } from '@tundraconnect/ntfy/errors';
 *
 * throw new NtfyError('AUTH_REQUIRED', { status: 401 });
 * ```
 */
export class NtfyError<
  M extends NtfyErrorMetadata = NtfyErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link NtfyErrorCodes}). */
  public readonly code: NtfyErrorCode;

  /** Formats every message as `[ntfy] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[ntfy] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with ntfy vendor metadata.
   *
   * @param code ntfy error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: NtfyErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'ntfy' } as M;

    if (!NtfyErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of NtfyErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(NtfyErrorCodes[code], context, cause);
    this.code = code;
  }
}
