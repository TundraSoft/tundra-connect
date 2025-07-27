import { BaseError } from '$utils';

/**
 * Error codes and messages for Surepass KYC API errors
 *
 * This object contains all possible error codes that can be thrown by the
 * Surepass client, along with their corresponding error messages.
 * Messages support template variables using ${variable} syntax.
 */
export const SurepassErrorCodes = {
  /** Generic unhandled error */
  UNHANDLED_ERROR: 'An unhandled error occurred.',
  /** Generic error when no specific error code matches */
  UNKNOWN_ERROR: 'An unknown error occurred in Surepass.',
  /** Error when API response is invalid or malformed */
  RESPONSE_ERROR:
    'Got an invalid response/response status: ${status}. Check details.',
  /** Error when the bearer token is invalid, expired, or lacks permissions */
  INVALID_TOKEN:
    'The bearer token has either expired or is invalid or does not have access to this scope.',
  /** Error when API rate limits are exceeded */
  RATE_LIMIT_EXCEEDED:
    'You have exceeded the rate limit for this API. Please try again later.',
  /** Error when Surepass services are unavailable */
  SERVICE_UNAVAILABLE:
    "Surepass API's are down or facing issues. Please try again later.",
  /** Error when verification fails due to data issues */
  VERIFICATION_FAILED:
    'There is an issue with the data provided. Please re-check',
  /** Error when response parsing fails */
  PARSE_ERROR:
    'The response from API did not match the expected format. See details for more information.',
  /** Error for unknown response status codes */
  UNKNOWN_RESPONSE_ERROR:
    'Received an unknown response status code from Surepass API.',
};

/**
 * Valid error codes for Surepass errors
 */
export type SurepassErrorCode = keyof typeof SurepassErrorCodes;

/**
 * Custom error class for Surepass KYC API errors
 *
 * Extends BaseError to provide Surepass-specific error handling with
 * structured error codes, metadata, and consistent error formatting.
 *
 * @template M - Metadata type extending base metadata with optional originalCode and endpoint
 *
 * @example
 * ```typescript
 * // Throw an error with metadata
 * throw new SurepassError('INVALID_TOKEN', {
 *   endpoint: 'pan/pan-comprehensive-plus',
 *   statusCode: 401
 * });
 *
 * // Throw an error with cause
 * try {
 *   // some operation
 * } catch (cause) {
 *   throw new SurepassError('RESPONSE_ERROR', {
 *     status: 500,
 *     endpoint: 'bank-verification'
 *   }, cause);
 * }
 * ```
 */
export class SurepassError<
  M extends
    & { originalCode?: SurepassErrorCode; endpoint?: string }
    & Record<string, unknown> =
      & { originalCode?: SurepassErrorCode }
      & Record<string, unknown>,
> extends BaseError<M> {
  /**
   * Template for error message formatting
   * @returns The message template with timestamp and message placeholders
   * @protected
   */
  protected override get _messageTemplate(): string {
    return '[Surepass] ${timeStamp}: ${message}';
  }

  /**
   * Creates a new SurepassError instance
   *
   * @param code - The error code from SurepassErrorCodes
   * @param meta - Optional metadata object with additional error context
   * @param cause - Optional underlying error that caused this error
   *
   * @example
   * ```typescript
   * // Basic error
   * new SurepassError('INVALID_TOKEN');
   *
   * // Error with metadata
   * new SurepassError('VERIFICATION_FAILED', {
   *   endpoint: 'pan/pan-comprehensive-plus',
   *   statusCode: 422
   * });
   *
   * // Error with cause
   * new SurepassError('RESPONSE_ERROR', {
   *   status: 500,
   *   endpoint: 'bank-verification'
   * }, networkError);
   * ```
   */
  constructor(code: SurepassErrorCode, meta?: M, cause?: Error) {
    // Handle unknown error codes by preserving original and falling back to UNKNOWN_ERROR
    if (!SurepassErrorCodes[code]) {
      if (!meta) {
        meta = {} as M;
      }
      meta.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }
    super(SurepassErrorCodes[code], meta, cause);
  }
}
