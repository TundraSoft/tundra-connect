import { RESTlerError } from '@restler';
import {
  type AzureBlobErrorCode,
  AzureBlobErrorCodes,
} from './AzureBlobErrorCodes.ts';

/** Metadata supplied with an {@link AzureBlobError}. */
export type AzureBlobErrorMetadata = {
  vendor: string;
  originalCode?: AzureBlobErrorCode;
} & Record<string, unknown>;

/**
 * Base error for AzureBlob configuration, request-validation, and vendor
 * response failures.
 *
 * @example
 * ```ts
 * import { AzureBlobError } from '@tundraconnect/azure-blob/errors';
 *
 * throw new AzureBlobError('BLOB_NOT_FOUND', { bucket: 'my-container', key: 'my-blob.txt' });
 * ```
 */
export class AzureBlobError<
  M extends AzureBlobErrorMetadata = AzureBlobErrorMetadata,
> extends RESTlerError<M> {
  /** The specific error code this instance was thrown with (see {@link AzureBlobErrorCodes}). */
  public readonly code: AzureBlobErrorCode;

  /** Formats every message as `[AzureBlob] <timestamp>: <message>`. */
  protected override get _messageTemplate(): string {
    return '[AzureBlob] ${timeStamp}: ${message}';
  }

  /**
   * Creates an error with AzureBlob vendor metadata.
   *
   * @param code AzureBlob error code.
   * @param meta Additional diagnostic metadata.
   * @param cause Underlying error, when available.
   */
  constructor(
    code: AzureBlobErrorCode,
    meta?: Omit<M, 'vendor'>,
    cause?: Error,
  ) {
    const context = { ...meta, vendor: 'AzureBlob' } as M;

    if (!AzureBlobErrorCodes[code]) {
      context.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }

    // Fill any message-template placeholder the throw site didn't supply, so
    // the rendered message never shows a literal '${...}' (the templating
    // engine renders missing/undefined keys literally).
    for (const match of AzureBlobErrorCodes[code].matchAll(/\$\{(\w+)\}/g)) {
      const key = String(match[1]);
      if ((context as Record<string, unknown>)[key] === undefined) {
        (context as Record<string, unknown>)[key] = `<${key} unavailable>`;
      }
    }
    super(AzureBlobErrorCodes[code], context, cause);
    this.code = code;
  }
}
