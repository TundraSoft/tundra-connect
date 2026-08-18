/**
 * AzureBlob error-code to message-template map.
 *
 * Documented Azure Blob Storage REST API error codes (the `Code` element of
 * the XML `<Error>` envelope, also mirrored on the `x-ms-error-code`
 * response header) are preserved as UPPER_SNAKE_CASE variants of their
 * PascalCase vendor names — see
 * https://learn.microsoft.com/en-us/rest/api/storageservices/blob-service-error-codes.
 * Connect-specific codes cover configuration and local response-validation
 * failures that never reach the vendor.
 */
export const AzureBlobErrorCodes = {
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with Azure Blob Storage.',
  RESPONSE_ERROR:
    'Got an unexpected or malformed response from Azure Blob Storage.',

  // Configuration errors — thrown at construction time, before any request
  // is made.
  CONFIG_INVALID_ACCOUNT:
    'A non-empty Azure Storage account name (`auth.account`) is required — supply `auth: { type: "CUSTOM", account, accountKey }` or `auth: { type: "CUSTOM", account, sasToken }`.',
  CONFIG_MISSING_CREDENTIALS:
    'Either `accountKey` or `sasToken` must be supplied for account ${account}.',
  CONFIG_INVALID_API_VERSION:
    '`apiVersion` must be a non-empty string, got ${apiVersion}.',

  // Request-input validation — thrown before a request is sent.
  INVALID_BUCKET: 'A non-empty container name (`bucket`) is required.',
  INVALID_KEY:
    'A non-empty blob name (`key`) is required for container ${bucket}.',
  INVALID_PATH_SEGMENT:
    'Invalid AzureBlob ${field}: "${value}" — must not contain a "." or ".." path segment.',

  // Documented Azure Blob Storage REST API error codes.
  BLOB_NOT_FOUND:
    'The specified blob ${key} does not exist in container ${bucket}.',
  CONTAINER_NOT_FOUND: 'The specified container ${bucket} does not exist.',
  BLOB_ALREADY_EXISTS: 'The specified blob already exists.',
  CONTAINER_ALREADY_EXISTS: 'The specified container already exists.',
  INVALID_BLOB_TYPE:
    'The blob type is invalid for this operation (e.g. an append/page blob where a block blob was expected).',
  AUTHENTICATION_FAILED:
    'Server failed to authenticate the request — verify the account name and key.',
  INVALID_AUTHENTICATION_INFO:
    'The authentication information was not provided in the correct format.',
  NO_AUTHENTICATION_INFORMATION:
    'No authentication information was provided in the request.',
  ACCOUNT_IS_DISABLED: 'The specified Azure Storage account is disabled.',
  MISSING_REQUIRED_HEADER: 'A required HTTP header was not specified.',
  INVALID_HEADER_VALUE:
    'The value provided for one of the HTTP headers was not in the correct format.',
  REQUEST_BODY_TOO_LARGE:
    'The size of the request body exceeds the maximum size permitted.',
  SERVER_BUSY:
    'The server is currently unable to receive requests — please retry.',
  INTERNAL_ERROR:
    'The server encountered an internal error — please retry the request.',
} as const;

/** Valid AzureBlob error code. */
export type AzureBlobErrorCode = keyof typeof AzureBlobErrorCodes;
