import { RESTlerError } from '@restler';
import { type SlackErrorCode, SlackErrorCodes } from './SlackErrorCodes.ts';

/** Metadata supplied with a {@link SlackError}. */
export type SlackErrorMetadata = {
  vendor: string;
  originalCode?: SlackErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Slack configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { SlackError } from '@tundraconnect/slack/errors';
 *
 * throw new SlackError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class SlackError<
  M extends SlackErrorMetadata = SlackErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link SlackErrorCodes}).
   */
  public readonly code: SlackErrorCode;

  /** Formats every message as `[slack] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[slack] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Slack vendor metadata.
   *
   * @param code Slack error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: SlackErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Slack' } as M;

    if (!SlackErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of SlackErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(SlackErrorCodes[code], context, cause);
    this.code = code;
  }
}
