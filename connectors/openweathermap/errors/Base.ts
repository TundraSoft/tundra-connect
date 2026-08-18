import { RESTlerError } from '@restler';
import {
  type OpenWeatherMapErrorCode,
  OpenWeatherMapErrorCodes,
} from './OpenWeatherMapErrorCodes.ts';

/** Metadata supplied with an {@link OpenWeatherMapError}. */
export type OpenWeatherMapErrorMetadata = {
  vendor: string;
  originalCode?: OpenWeatherMapErrorCode;
} & Record<string, unknown>;

/**
 * Base error for OpenWeatherMap configuration, vendor, and response
 * failures.
 *
 * @example
 * ```ts
 * import { OpenWeatherMapError } from '@tundraconnect/openweathermap/errors';
 *
 * throw new OpenWeatherMapError('INVALID_API_KEY', { status: 401 });
 * ```
 */
export class OpenWeatherMapError<
  M extends OpenWeatherMapErrorMetadata = OpenWeatherMapErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link OpenWeatherMapErrorCodes}). */
  public readonly code: OpenWeatherMapErrorCode;

  protected override get _messageTemplate(): string {
    return '[OpenWeatherMap] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with OpenWeatherMap vendor metadata.
   *
   * @param code OpenWeatherMap error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: OpenWeatherMapErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'OpenWeatherMap' } as M;

    if (!OpenWeatherMapErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (
      const match of OpenWeatherMapErrorCodes[code].matchAll(/\$\{(\w+)\}/g)
    ) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(OpenWeatherMapErrorCodes[code], context, cause);
    this.code = code;
  }
}
