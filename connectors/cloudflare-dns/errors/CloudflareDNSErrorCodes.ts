/**
 * CloudflareDNS error-code to message-template map.
 *
 * Cloudflare reports failures in the `errors` array of its `client/v4`
 * envelope, each with a numeric code. The vendor-facing codes below are
 * what those numbers (and, failing a recognised number, the HTTP status)
 * map onto — see the table in `CloudflareDNS.__toError` — so a caller
 * branches on a stable name (`err.code === 'RECORD_CONFLICT'`) rather
 * than on `81057`. No message template interpolates the API token.
 */
export const CloudflareDNSErrorCodes = {
  // Placeholder-free, like every other connect's UNKNOWN_ERROR — the
  // status/detail still travel in the error's context.
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with the Cloudflare DNS API.',
  CONFIG_INVALID_API_TOKEN:
    "A Cloudflare API token is required — pass `auth: { type: 'BEARER', token }`.",
  CONFIG_INVALID_ZONE_ID:
    'A Cloudflare zone id must be a non-empty identifier (`zoneId`).',
  REQUEST_VALIDATION_ERROR: 'The DNS request is invalid: ${reason}',
  RESPONSE_ERROR: 'Cloudflare DNS response did not match the expected schema.',
  INVALID_REQUEST:
    'Cloudflare rejected the request as invalid (HTTP ${status}): ${detail}',
  AUTH_FAILED: 'Cloudflare rejected the API token (HTTP ${status}): ${detail}',
  FORBIDDEN:
    'The API token may not perform this DNS operation (HTTP ${status}): ${detail}',
  NOT_FOUND:
    'The zone or DNS record does not exist (HTTP ${status}): ${detail}',
  RECORD_CONFLICT:
    'A conflicting DNS record already exists (HTTP ${status}): ${detail}',
  RATE_LIMITED:
    'Cloudflare API rate limit exceeded (HTTP ${status}): ${detail}',
  TIMEOUT:
    'The Cloudflare DNS API did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to the Cloudflare DNS API failed before a response (DNS, TLS or connection failure).',
  SERVICE_UNAVAILABLE:
    'The Cloudflare DNS API is currently unavailable (HTTP ${status}): ${detail}',
} as const;

/** Valid CloudflareDNS error code. */
export type CloudflareDNSErrorCode = keyof typeof CloudflareDNSErrorCodes;

/**
 * The codes that mean "no answer yet — try again later", as opposed to a
 * definite refusal or a misconfiguration retrying will not fix: the
 * timeout passed, the network failed, Cloudflare returned a 5xx, or it
 * rate-limited the call. {@link CloudflareDNSError.transient} is `true` for
 * exactly these.
 */
export const CLOUDFLARE_DNS_TRANSIENT_CODES: ReadonlySet<
  CloudflareDNSErrorCode
> = new Set<
  CloudflareDNSErrorCode
>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
]);
