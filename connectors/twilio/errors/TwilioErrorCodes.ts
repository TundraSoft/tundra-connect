/**
 * Twilio error-code to message-template map.
 *
 * Vendor-documented codes (https://www.twilio.com/docs/api/errors) are
 * reused verbatim as the metadata `code`, keyed here under a descriptive
 * name; connect-specific codes cover configuration and response validation
 * failures that Twilio itself doesn't assign a code to.
 */
export const TwilioErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while calling the Twilio API.',

  // Connect-specific: configuration failures, caught at construction.
  CONFIG_INVALID_ACCOUNT_SID:
    "accountSid must match '^AC[0-9a-fA-F]{32}$', got '${accountSid}'.",
  CONFIG_INCOMPLETE_API_KEY:
    'apiKeySid and apiKeySecret must be supplied together.',
  CONFIG_MISSING_CREDENTIALS:
    'Either authToken or both apiKeySid and apiKeySecret must be supplied.',

  // Connect-specific: local request validation, caught before the call.
  INVALID_REQUEST: 'Request is invalid: ${reason}',

  // Vendor-documented codes (https://www.twilio.com/docs/api/errors).
  AUTH_FAILED:
    'Authentication failed (Twilio error 20003) — check the Account SID/Auth Token or API Key credentials.',
  RATE_LIMITED:
    'Too many requests (Twilio error 20429) — the account has exceeded its concurrency limit.',
  INVALID_TO_NUMBER:
    "The 'To' number is not a valid phone number (Twilio error 21211).",
  NON_SMS_CAPABLE_FROM_NUMBER:
    "The 'From' number is not SMS-capable (Twilio error 21606).",
  UNVERIFIED_TO_NUMBER:
    "The 'To' number is unverified — trial accounts can only send to verified numbers (Twilio error 21608).",
  UNSUBSCRIBED_RECIPIENT:
    "The 'To' number has unsubscribed from messages from this sender (Twilio error 21610).",
  UNROUTABLE_TO_NUMBER: "The 'To' number is unroutable (Twilio error 21612).",
  NON_SMS_CAPABLE_TO_NUMBER:
    "The 'To' number is not SMS-capable (Twilio error 21614).",
  INTERNATIONAL_PERMISSION_DENIED:
    'International permissions are not enabled for this destination (Twilio error 21408).',

  // Vendor-documented codes, Voice-specific (https://www.twilio.com/docs/api/errors).
  INVALID_FROM_NUMBER:
    "The 'From' number is not a valid phone number, Alphanumeric Sender ID, or approved WhatsApp Sender (Twilio error 21212).",
  UNREACHABLE_TO_NUMBER:
    "The 'To' phone number cannot be reached (Twilio error 21214).",
  UNVERIFIED_TO_NUMBER_VOICE:
    "The 'To' number is unverified — trial accounts can only call verified numbers (Twilio error 21219).",
  TWIML_FETCH_FAILED:
    "Twilio could not retrieve a successful response from the call's TwiML/webhook URL (Twilio error 11200).",
  ACCOUNT_SUSPENDED:
    'The account is not active and cannot make or receive calls (Twilio error 10001).',

  // Fallbacks for undocumented / unparseable responses.
  RESPONSE_ERROR:
    'Got an unexpected or malformed response from the Twilio API.',
  SERVICE_UNAVAILABLE:
    'The Twilio service is currently unavailable (status ${status}).',
  WEBHOOK_INVALID_HEADERS:
    'The webhook request is missing a required signature header: ${reason}',
  WEBHOOK_INVALID_AUTH_TOKEN:
    'Webhook verification needs the ACCOUNT auth token — pass `authToken` explicitly when this client authenticates with an API key.',
  WEBHOOK_SIGNATURE_INVALID:
    'The webhook signature does not match — treat this request as forged.',
} as const;

/** Valid Twilio error code. */
export type TwilioErrorCode = keyof typeof TwilioErrorCodes;
