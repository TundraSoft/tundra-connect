/**
 * Deribit error-code to message-template map.
 *
 * Deribit answers every request with a JSON-RPC envelope; a refusal
 * carries `error: { code, message, data? }` (e.g. `-32602 Invalid params`,
 * `10028 too_many_requests`, `13778 raw_subscriptions_not_available_for_unauthorized`).
 * These codes group those by what a caller does about them, and keep
 * Deribit's own `code`/`message` as `vendorCode`/`vendorMessage`. The
 * `SOCKET_*` codes cover the `./sockets` feed.
 */
export const DeribitErrorCodes = {
  UNKNOWN_ERROR: 'An unknown error occurred while communicating with Deribit.',
  CONFIG_INVALID_AUTH:
    'Deribit auth must be { type: "CUSTOM", clientId, clientSecret } with non-empty strings.',
  CONFIG_RAW_REQUIRES_AUTH:
    'Deribit only serves raw (unthrottled) channels on an authenticated connection: pass `auth` (a read-only key is enough) or use interval "100ms".',
  CONFIG_INVALID_OPTION: 'Invalid Deribit option ${option}: ${reason}',

  // Connect-specific: local request validation, caught before the call is
  // ever made.
  INVALID_REQUEST: 'Request failed local validation: ${reason}',

  BAD_REQUEST:
    'Deribit rejected the request: ${vendorMessage} (code ${vendorCode}).',
  NOT_FOUND: 'Deribit has no such method or object: ${vendorMessage}.',
  UNAUTHORIZED:
    'Deribit refused the credentials or the call needs them: ${vendorMessage} (code ${vendorCode}).',
  RATE_LIMITED: 'Deribit rate limit exceeded (code ${vendorCode}).',
  RESPONSE_ERROR: 'Deribit API response did not match the expected schema.',
  SERVICE_UNAVAILABLE: 'Deribit is currently unavailable (HTTP ${status}).',
  TIMEOUT: 'Deribit did not answer within the ${timeoutSeconds}s timeout.',
  NETWORK_ERROR:
    'The request to Deribit failed before a response (DNS, TLS or connection failure).',

  SOCKET_UNSUPPORTED_RUNTIME:
    'The ${feed} socket could not create a WebSocket: ${detail}. Pass a `webSocket` factory on runtimes without a usable global WebSocket.',
  SOCKET_RECONNECT_EXHAUSTED:
    'The ${feed} socket gave up after ${attempts} reconnect attempts (last: ${reason}).',
  SOCKET_BUFFER_OVERFLOW:
    'The ${feed} socket buffered more than ${maxBufferedEvents} unread events and closed rather than drop any.',
  SOCKET_IN_USE:
    'The ${feed} socket already has an active iterator; only one consumer may read it.',
  SOCKET_CLOSED: 'The ${feed} socket is closed.',
  SOCKET_HANDLER_ERROR: 'The ${feed} socket failed while ${during}: ${detail}',
  SOCKET_INVALID_MESSAGE:
    'A ${feed} `${venueType}` message did not match the expected schema.',
  SOCKET_VENUE_ERROR:
    'Deribit reported an error on the ${feed} socket: ${detail}',
  SOCKET_AUTH_FAILED:
    'Deribit refused the socket credentials: ${detail}. Not retried.',
  SOCKET_SUBSCRIBE_FAILED:
    'Deribit refused a subscription on the ${feed} socket: ${detail}',
} as const;

/** Valid Deribit error code. */
export type DeribitErrorCode = keyof typeof DeribitErrorCodes;

/**
 * The codes that mean "no answer yet — try again later": the timeout
 * passed, the network failed, Deribit is down, or it rate-limited the
 * call. {@link DeribitError.transient} is `true` for exactly these.
 */
export const DERIBIT_TRANSIENT_CODES: ReadonlySet<DeribitErrorCode> = new Set<
  DeribitErrorCode
>([
  'TIMEOUT',
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
]);

/** Deribit codes that mean the call needs (other) credentials. */
const UNAUTHORIZED_CODES = new Set([13004, 13009, 13021, 13778]);
/** Deribit codes that mean "busy or unavailable, try again". */
const UNAVAILABLE_CODES = new Set([10040, 13028, 13888]);

/**
 * This connect's code for a Deribit JSON-RPC error code: `10028` →
 * `RATE_LIMITED`; `13004`/`13009`/`13021`/`13778` → `UNAUTHORIZED`;
 * `-32601` → `NOT_FOUND`; `10040`/`13028`/`13888` → `SERVICE_UNAVAILABLE`;
 * anything else → `BAD_REQUEST`.
 *
 * @example
 * ```ts
 * import { deribitErrorCode } from '@tundraconnect/deribit/errors';
 *
 * console.log(deribitErrorCode(13778)); // 'UNAUTHORIZED'
 * ```
 */
export function deribitErrorCode(vendorCode: number): DeribitErrorCode {
  if (vendorCode === 10028) return 'RATE_LIMITED';
  if (UNAUTHORIZED_CODES.has(vendorCode)) return 'UNAUTHORIZED';
  if (vendorCode === -32601) return 'NOT_FOUND';
  if (UNAVAILABLE_CODES.has(vendorCode)) return 'SERVICE_UNAVAILABLE';
  return 'BAD_REQUEST';
}
