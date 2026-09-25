/**
 * Algolia error-code to message-template map.
 *
 * Algolia's error envelope (`{ message, status }`, see
 * {@link ErrorEnvelopeSchemaObject} in `../schema/Error.ts`) carries only a
 * human-readable `message` and the HTTP `status` that was already returned
 * — there is no vendor-specific numeric error code to key off, so these
 * codes are dispatched purely on HTTP status (see `Algolia.ts`'s
 * `__toError`). `INVALID_REQUEST` is intentionally reused for both a local
 * (pre-request) Guardian validation failure and a vendor 400/422 response —
 * both mean "the request itself was rejected as invalid," just before vs.
 * after being sent.
 */
export const AlgoliaErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with Algolia.',
  INVALID_REQUEST:
    'Algolia rejected the request as invalid (HTTP ${status}): ${message}',
  RESPONSE_ERROR: 'Algolia API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'Algolia service is currently unavailable (HTTP ${status}).',
  /** 401/403 — invalid `applicationId`/`apiKey`, or a key missing the required ACL for the operation. */
  AUTH_FAILED:
    'Algolia rejected the request as unauthenticated or forbidden (HTTP ${status}): ${message}',
  /** 404 — the index, object, or task does not exist. */
  NOT_FOUND:
    'The requested Algolia resource was not found (HTTP ${status}): ${message}',
  /** 429 — too many requests for the configured plan/quota. */
  RATE_LIMITED: 'Algolia rate limit exceeded (HTTP ${status}).',
  /** Local configuration error — `auth` is missing or not `{ type: 'CUSTOM', ... }`. */
  CONFIG_INVALID_AUTH:
    "Algolia auth must be { type: 'CUSTOM', applicationId, apiKey }, got type '${authType}'.",
  /** Local configuration error — `auth.applicationId` is missing/empty. Never echoes `apiKey`. */
  CONFIG_INVALID_APPLICATION_ID:
    'Algolia auth.applicationId must be a non-empty string, got ${applicationId}.',
  /** Local configuration error — `auth.apiKey` is missing/empty. Deliberately never echoes the (invalid) value. */
  CONFIG_INVALID_API_KEY: 'Algolia auth.apiKey must be a non-empty string.',
  /** {@link Algolia.waitTask} exceeded its bounded polling budget without observing `status: 'published'`. */
  TASK_TIMEOUT:
    'Timed out after ${timeoutMs}ms waiting for Algolia task ${taskID} on index "${indexName}" to publish (last observed status: ${lastStatus}).',
} as const;

/** Valid Algolia error code. */
export type AlgoliaErrorCode = keyof typeof AlgoliaErrorCodes;
