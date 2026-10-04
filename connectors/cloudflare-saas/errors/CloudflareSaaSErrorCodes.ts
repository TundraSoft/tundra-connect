/**
 * CloudflareSaaS error-code to message-template map.
 *
 * Cloudflare reports failures in the `errors` array of its `client/v4`
 * envelope, each with a numeric code. The custom-hostname service documents
 * its own codes in the 14xx range (see
 * https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/reference/status-codes/custom-hostnames/);
 * the vendor-facing names below are what those numbers (and, failing a
 * recognised number, the HTTP status) map onto — see the table in
 * `CloudflareSaaS.__toError`. No message template interpolates the API
 * token.
 */
export const CloudflareSaaSErrorCodes = {
  // Placeholder-free, like every other connect's UNKNOWN_ERROR — the
  // status/detail still travel in the error's context.
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with the Cloudflare for SaaS API.',
  CONFIG_INVALID_API_TOKEN:
    "A Cloudflare API token is required — pass `auth: { type: 'BEARER', token }`.",
  CONFIG_INVALID_ZONE_ID:
    'A non-empty Cloudflare zone id is required (`zoneId`) — the zone your SaaS target lives in.',
  REQUEST_VALIDATION_ERROR: 'The custom hostname request is invalid: ${reason}',
  RESPONSE_ERROR:
    'Cloudflare for SaaS response did not match the expected schema.',
  INVALID_REQUEST:
    'Cloudflare rejected the request as invalid (HTTP ${status}): ${detail}',
  INVALID_HOSTNAME:
    'Cloudflare rejected the hostname or origin hostname (HTTP ${status}): ${detail}',
  DUPLICATE_HOSTNAME:
    'That custom hostname already exists in this zone (HTTP ${status}): ${detail}',
  QUOTA_EXCEEDED:
    'This zone has no custom hostname quota left (HTTP ${status}): ${detail}',
  NOT_FOUND:
    'The custom hostname, zone or fallback origin does not exist (HTTP ${status}): ${detail}',
  AUTH_FAILED: 'Cloudflare rejected the API token (HTTP ${status}): ${detail}',
  FORBIDDEN:
    'The API token may not perform this Cloudflare for SaaS operation (HTTP ${status}): ${detail}',
  RATE_LIMITED:
    'Cloudflare API rate limit exceeded (HTTP ${status}): ${detail}',
  TIMEOUT:
    'The Cloudflare for SaaS API did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to the Cloudflare for SaaS API failed before a response (DNS, TLS or connection failure).',
  SERVICE_UNAVAILABLE:
    'The Cloudflare for SaaS API is currently unavailable (HTTP ${status}): ${detail}',
} as const;

/** Valid CloudflareSaaS error code. */
export type CloudflareSaaSErrorCode = keyof typeof CloudflareSaaSErrorCodes;

/**
 * The codes that mean "no answer yet — try again later", as opposed to a
 * definite refusal or a misconfiguration retrying will not fix: the
 * timeout passed, the network failed, Cloudflare returned a 5xx, or it
 * rate-limited the call. {@link CloudflareSaaSError.transient} is `true` for
 * exactly these.
 */
export const CLOUDFLARE_SAAS_TRANSIENT_CODES: ReadonlySet<
  CloudflareSaaSErrorCode
> = new Set<
  CloudflareSaaSErrorCode
>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
]);
