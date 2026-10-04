/**
 * GoogleAnalytics error-code to message-template map.
 *
 * The Measurement Protocol answers `2xx` for any request it received, even
 * one whose payload it will silently drop, so most mistakes are caught
 * locally (`REQUEST_VALIDATION_ERROR`) or by `validate()` against the debug
 * endpoint, which reports them as `validationMessages` rather than errors.
 * The codes below cover what is left: configuration, an HTTP-level refusal,
 * and transport failures. No message template interpolates the API secret.
 */
export const GoogleAnalyticsErrorCodes = {
  // Placeholder-free, like every other connect's UNKNOWN_ERROR.
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with the GA4 Measurement Protocol.',
  CONFIG_INVALID_AUTH:
    "GA4 needs `auth: { type: 'CUSTOM', apiSecret }` — a Measurement Protocol API secret from Admin > Data Streams.",
  CONFIG_INVALID_STREAM:
    'Exactly one of `measurementId` (a web stream, `G-…`) or `firebaseAppId` (an app stream) is required.',
  CONFIG_INVALID_REGION: "`region` must be 'global' or 'eu'.",
  REQUEST_VALIDATION_ERROR:
    'The Measurement Protocol payload is invalid: ${reason}',
  INVALID_REQUEST:
    'The Measurement Protocol rejected the request (HTTP ${status}).',
  AUTH_FAILED:
    'The Measurement Protocol rejected the credentials (HTTP ${status}).',
  RATE_LIMITED:
    'The Measurement Protocol rate limit was exceeded (HTTP ${status}).',
  SERVICE_UNAVAILABLE:
    'The Measurement Protocol is currently unavailable (HTTP ${status}).',
  TIMEOUT:
    'The Measurement Protocol did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to the Measurement Protocol failed before a response (DNS, TLS or connection failure).',
  RESPONSE_ERROR:
    'The Measurement Protocol debug response did not match the expected schema.',
} as const;

/** Valid GoogleAnalytics error code. */
export type GoogleAnalyticsErrorCode = keyof typeof GoogleAnalyticsErrorCodes;

/**
 * The codes that mean "no answer yet — try again later", as opposed to a
 * definite refusal or a misconfiguration retrying will not fix: the
 * timeout passed, the network failed, Google returned a 5xx, or it
 * rate-limited the call. {@link GoogleAnalyticsError.transient} is `true`
 * for exactly these.
 */
export const GOOGLE_ANALYTICS_TRANSIENT_CODES: ReadonlySet<
  GoogleAnalyticsErrorCode
> = new Set<GoogleAnalyticsErrorCode>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
]);
