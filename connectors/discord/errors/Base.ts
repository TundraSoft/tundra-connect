import { RESTlerError } from '@restler';
import {
  type DiscordErrorCode,
  DiscordErrorCodes,
} from './DiscordErrorCodes.ts';

/** Metadata supplied with a {@link DiscordError}. */
export type DiscordErrorMetadata = {
  vendor: string;
  originalCode?: DiscordErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Discord configuration, request-validation, and vendor
 * response failures — covering both the webhook and the bot REST API
 * integration surfaces.
 *
 * @example
 * ```ts
 * import { DiscordError } from '@tundraconnect/discord/errors';
 *
 * throw new DiscordError('EMPTY_MESSAGE', { status: 400 });
 * ```
 */
export class DiscordError<
  M extends DiscordErrorMetadata = DiscordErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link DiscordErrorCodes}). */
  public readonly code: DiscordErrorCode;

  /** Formats every message as `[Discord] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[Discord] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Discord vendor metadata.
   *
   * @param code Discord error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: DiscordErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Discord' } as M;

    if (!DiscordErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of DiscordErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(DiscordErrorCodes[code], context, cause);
    this.code = code;
  }
}
