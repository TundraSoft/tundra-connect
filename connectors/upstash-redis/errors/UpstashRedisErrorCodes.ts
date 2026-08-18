/**
 * UpstashRedis error-code to message-template map.
 *
 * Upstash's REST API documents exactly four HTTP outcomes for a single
 * command: `200` (success), `401` (auth token missing/invalid), `405`
 * (unsupported HTTP method), and `400` — which covers BOTH a malformed
 * request (bad JSON, unknown command) AND a Redis-level command failure
 * (e.g. `"ERR wrong number of arguments for 'get' command"`). Verified
 * directly against Upstash's docs: there is no separate status for "the
 * request was well-formed but the command itself failed" — both cases
 * return `400` with the same `{"error": "..."}` envelope. `COMMAND_ERROR`
 * below reflects that reality with a single code carrying the vendor's raw
 * message via `reason`, rather than guessing at a distinction the vendor
 * itself doesn't surface.
 *
 * `INVALID_REQUEST` is a different thing entirely: validation this connect
 * performs itself, locally, before any request is sent (SET's `EX`/`PX` or
 * `NX`/`XX` mutual exclusion, an empty `DEL`/`LPUSH`/`HSET` argument list).
 * It never carries an HTTP status.
 */
export const UpstashRedisErrorCodes = {
  UNKNOWN_ERROR:
    'An unknown error occurred while communicating with UpstashRedis.',
  CONFIG_INVALID_TOKEN: 'UpstashRedis Bearer token must be a non-empty string.',
  REQUEST_VALIDATION_ERROR:
    'The request failed local schema validation and was not sent.',
  INVALID_REQUEST: 'UpstashRedis request is invalid: ${reason}.',
  AUTH_FAILED:
    'UpstashRedis rejected the request as unauthenticated — the Bearer token is missing or invalid (HTTP ${status}).',
  COMMAND_ERROR: 'UpstashRedis command failed: ${reason} (HTTP ${status}).',
  METHOD_NOT_ALLOWED:
    'The HTTP method is not allowed for this UpstashRedis endpoint (HTTP ${status}).',
  RESPONSE_ERROR:
    'UpstashRedis API response did not match the expected schema.',
  SERVICE_UNAVAILABLE:
    'UpstashRedis service is currently unavailable (HTTP ${status}).',
} as const;

/** Valid UpstashRedis error code. */
export type UpstashRedisErrorCode = keyof typeof UpstashRedisErrorCodes;
