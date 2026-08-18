/**
 * S3 error-code to message-template map.
 *
 * The vendor-documented `<Error><Code>` values (`NoSuchKey`,
 * `AccessDenied`, ...) are preserved, renamed to `UPPER_SNAKE_CASE` per
 * this repo's error-code convention; connect-specific codes cover
 * configuration and response validation failures that never reach S3.
 */
export const S3ErrorCodes = {
  // -- Configuration --------------------------------------------------
  CONFIG_INVALID_AUTH:
    'S3 auth must be { type: "CUSTOM", accessKeyId, secretAccessKey, region } — got ${accessKeyId}.',
  CONFIG_INVALID_BUCKET:
    'Bucket name must be a non-empty string, got ${bucket}.',
  CONFIG_INVALID_KEY: 'Object key must be a non-empty string, got ${key}.',
  CONFIG_INVALID_BODY:
    'putObject body must be a Blob, Uint8Array, ArrayBuffer, or string, got ${bodyType}.',
  CONFIG_INVALID_FORCE_PATH_STYLE:
    'forcePathStyle must be a boolean, got ${value}.',
  INVALID_OBJECT_KEY:
    'Invalid S3 ${field}: "${value}" — must not contain a "." or ".." path segment.',

  // -- Response validation ---------------------------------------------
  RESPONSE_ERROR: 'Got an unexpected or malformed response from S3.',

  // -- Documented vendor error codes (mapped from <Error><Code>) --------
  NO_SUCH_KEY: 'The specified key ${key} does not exist.',
  NO_SUCH_BUCKET: 'The specified bucket ${bucket} does not exist.',
  ACCESS_DENIED: 'Access denied for the requested S3 operation.',
  INVALID_ACCESS_KEY_ID: 'The AWS access key id provided does not exist.',
  SIGNATURE_DOES_NOT_MATCH:
    'The request signature did not match — this indicates a SigV4 signing bug.',
  REQUEST_TIME_TOO_SKEWED:
    'The request timestamp is too far from the S3 server clock.',
  PRECONDITION_FAILED:
    'A precondition on the request (e.g. If-Match) was not met.',
  INVALID_RANGE: 'The requested Range is not satisfiable for this object.',
  ENTITY_TOO_LARGE: 'The uploaded object exceeds the maximum allowed size.',
  METHOD_NOT_ALLOWED:
    'The specified HTTP method is not allowed for this resource.',
  INTERNAL_ERROR: 'S3 encountered an internal error.',
  SLOW_DOWN:
    'Request rate for this bucket/prefix is too high — back off and retry.',
  SERVICE_UNAVAILABLE: 'S3 service is currently unavailable.',

  // -- Fallback -----------------------------------------------------
  UNKNOWN_ERROR: 'An unknown error occurred in S3.',
} as const;

/** Valid S3 error code. */
export type S3ErrorCode = keyof typeof S3ErrorCodes;
