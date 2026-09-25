import { RESTlerError } from '@restler';
import {
  type AlgoliaErrorCode,
  AlgoliaErrorCodes,
} from './AlgoliaErrorCodes.ts';

/** Metadata supplied with a {@link AlgoliaError}. */
export type AlgoliaErrorMetadata = {
  vendor: string;
  originalCode?: AlgoliaErrorCode;
} & Record<string, unknown>;

/**
 * Base error for Algolia configuration, vendor, and response failures.
 *
 * @example
 * ```ts
 * import { AlgoliaError } from '@tundraconnect/algolia/errors';
 *
 * throw new AlgoliaError('SERVICE_UNAVAILABLE', { status: 503 });
 * ```
 */
export class AlgoliaError<
  M extends AlgoliaErrorMetadata = AlgoliaErrorMetadata,
> extends RESTlerError<M> {
  /**
   * The specific error code this instance was thrown with (see
   * {@link AlgoliaErrorCodes}).
   */
  public readonly code: AlgoliaErrorCode;

  /** Formats every message as `[algolia] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[algolia] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with Algolia vendor metadata.
   *
   * @param code Algolia error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: AlgoliaErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'Algolia' } as M;

    if (!AlgoliaErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of AlgoliaErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = match[1]!;
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }

    super(AlgoliaErrorCodes[code], context, cause);
    this.code = code;
  }
}
