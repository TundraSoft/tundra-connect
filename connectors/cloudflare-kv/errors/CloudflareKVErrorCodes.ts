/**
 * CloudflareKV error-code to message-template map.
 *
 * Cloudflare reports failures in the `errors` array of its `client/v4`
 * envelope, each with a numeric code. The vendor-facing codes below are
 * what those numbers (and, failing a recognised number, the HTTP status)
 * map onto, so a caller branches on a stable name
 * (`err.code === 'NOT_FOUND'`) rather than on `10009`. The `KEY_*`,
 * `VALUE_*`, `METADATA_*` and `EXPIRATION_*` codes are raised locally,
 * before anything is sent, when a call breaks one of Workers KV's
 * documented limits. No message template interpolates a credential.
 */
export const CloudflareKVErrorCodes = {
  // Placeholder-free, like every other connect's UNKNOWN_ERROR — the
  // status/detail still travel in the error's context.
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with the Cloudflare Workers KV API.',
  CONFIG_INVALID_AUTH:
    "Cloudflare credentials are required — pass `auth: { type: 'BEARER', token }` or `auth: { type: 'CUSTOM', email, key }`.",
  CONFIG_INVALID_ACCOUNT_ID:
    'A Cloudflare account id must be a non-empty identifier (`accountId`).',
  CONFIG_INVALID_NAMESPACE_ID:
    'A Workers KV namespace id must be a non-empty identifier (`namespaceId`).',
  CONFIG_INVALID_RETRY: 'The `retry` option is invalid: ${reason}',
  REQUEST_VALIDATION_ERROR: 'The Workers KV request is invalid: ${reason}',
  KEY_INVALID: 'The key is not a valid Workers KV key name: ${reason}',
  KEY_TOO_LONG:
    'The key is ${bytes} bytes; Workers KV allows at most ${limit} bytes.',
  VALUE_TOO_LARGE:
    'The value for key "${key}" is ${bytes} bytes; Workers KV allows at most ${limit} bytes.',
  METADATA_INVALID:
    'The metadata for key "${key}" is not JSON-serializable: ${reason}',
  METADATA_TOO_LARGE:
    'The metadata for key "${key}" serializes to ${bytes} bytes; Workers KV allows at most ${limit} bytes.',
  EXPIRATION_INVALID: 'The expiration for key "${key}" is invalid: ${reason}',
  RESPONSE_ERROR:
    'Cloudflare Workers KV response did not match the expected schema.',
  INVALID_REQUEST:
    'Cloudflare rejected the request as invalid (HTTP ${status}): ${detail}',
  AUTH_FAILED:
    'Cloudflare rejected the credentials (HTTP ${status}): ${detail}',
  FORBIDDEN:
    'The credentials may not perform this Workers KV operation (HTTP ${status}): ${detail}',
  NOT_FOUND: 'The namespace or key does not exist (HTTP ${status}): ${detail}',
  CONFLICT:
    'The request conflicts with an existing resource (HTTP ${status}): ${detail}',
  RATE_LIMITED:
    'Cloudflare API rate limit exceeded (HTTP ${status}): ${detail}',
  TIMEOUT:
    'The Cloudflare Workers KV API did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to the Cloudflare Workers KV API failed before a response (DNS, TLS or connection failure).',
  SERVICE_UNAVAILABLE:
    'The Cloudflare Workers KV API is currently unavailable (HTTP ${status}): ${detail}',
} as const;

/** Valid CloudflareKV error code. */
export type CloudflareKVErrorCode = keyof typeof CloudflareKVErrorCodes;

/**
 * The codes that mean "no answer yet — try again later", as opposed to a
 * definite refusal or a misconfiguration retrying will not fix: the
 * timeout passed, the network failed, Cloudflare returned a 5xx, or it
 * rate-limited the call. {@link CloudflareKVError.transient} is `true` for
 * exactly these, and they are the codes the client's own retry acts on.
 */
export const CLOUDFLARE_KV_TRANSIENT_CODES: ReadonlySet<
  CloudflareKVErrorCode
> = new Set<CloudflareKVErrorCode>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
]);
