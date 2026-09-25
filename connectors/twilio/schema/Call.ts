import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Documented lifecycle states of a Twilio Call resource
 * (https://www.twilio.com/docs/voice/api/call-resource#call-status-values).
 */
export const CALL_STATUSES = [
  'queued',
  'ringing',
  'in-progress',
  'canceled',
  'completed',
  'busy',
  'failed',
  'no-answer',
] as const;

/**
 * Documented direction values of a Twilio Call resource, taken from the
 * `Direction` parameter Twilio sends to a `StatusCallback` URL: `inbound`
 * for inbound calls, `outbound-api` for calls created via this REST API,
 * `outbound-dial` for calls created by a TwiML `<Dial>` verb.
 */
export const CALL_DIRECTIONS = [
  'inbound',
  'outbound-api',
  'outbound-dial',
] as const;

/**
 * Schema for the Twilio Call resource
 *
 * Validates the response body returned by the Create/Fetch/Update-a-Call
 * endpoints and each entry of the Read-multiple-Calls `calls` array. Several
 * fields that look numeric on the wire (`duration`, `price`, `queue_time`)
 * are documented — and modelled here — as strings, matching the Message
 * resource's `num_media`/`num_segments`/`price` convention.
 *
 * `answered_by` is modelled as a nullable string rather than a strict
 * `'human' | 'machine'` enum: Twilio's Call resource reference describes it
 * as "human or machine", but an actual list-Calls response example
 * documents a finer-grained value (`machine_start`) that a stricter enum
 * would reject.
 *
 * @example
 * ```typescript
 * import { CallSchemaObject } from '@tundraconnect/twilio/schemas';
 *
 * const [error, call] = CallSchemaObject.safeParse({
 *   sid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
 *   account_sid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
 *   to: '+14155552671',
 *   to_formatted: '(415) 555-2671',
 *   from: '+15017122661',
 *   from_formatted: '(501) 712-2661',
 *   phone_number_sid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
 *   status: 'queued',
 *   start_time: null,
 *   end_time: null,
 *   duration: null,
 *   price: null,
 *   price_unit: null,
 *   direction: 'outbound-api',
 *   answered_by: null,
 *   api_version: '2010-04-01',
 *   forwarded_from: null,
 *   group_sid: null,
 *   caller_name: null,
 *   queue_time: '0',
 *   trunk_sid: null,
 *   parent_call_sid: null,
 *   date_created: 'Thu, 01 Jan 2024 12:00:00 +0000',
 *   date_updated: 'Thu, 01 Jan 2024 12:00:00 +0000',
 *   uri: '/2010-04-01/Accounts/ACxx/Calls/CAxx.json',
 *   subresource_uris: { recordings: '/2010-04-01/Accounts/ACxx/Calls/CAxx/Recordings.json' },
 * });
 * if (!error) {
 *   console.log('Call SID:', call.sid);
 * }
 * ```
 */
export type CallSchema = {
  sid: string;
  account_sid: string;
  to: string;
  to_formatted?: string | null;
  from: string;
  from_formatted?: string | null;
  phone_number_sid?: string | null;
  status: (typeof CALL_STATUSES)[number];
  start_time: string | null;
  end_time: string | null;
  duration: string | null;
  price: string | null;
  price_unit: string | null;
  direction: (typeof CALL_DIRECTIONS)[number];
  answered_by: string | null;
  api_version: string;
  forwarded_from?: string | null;
  group_sid?: string | null;
  caller_name?: string | null;
  queue_time?: string | null;
  trunk_sid?: string | null;
  parent_call_sid?: string | null;
  date_created: string;
  date_updated: string;
  uri: string;
  subresource_uris: Record<string, string>;
};

const _callSchema: BaseGuardian<CallSchema> = Guardian.object({
  /** Unique identifier of the call (`CA` + 32 hex characters). */
  sid: Guardian.string(),
  /** Account SID that owns the call. */
  account_sid: Guardian.string(),
  /** Phone number, SIP address, Client identifier, or SIM SID that received the call. */
  to: Guardian.string(),
  /** Formatted version of `to`, for display. Not present on every response. */
  to_formatted: Guardian.string().nullable().optional(),
  /** Phone number, SIP address, or Client identifier that made the call. */
  from: Guardian.string(),
  /** Formatted version of `from`, for display. Not present on every response. */
  from_formatted: Guardian.string().nullable().optional(),
  /** SID of the incoming/outgoing phone number resource associated with the call, if any. */
  phone_number_sid: Guardian.string().nullable().optional(),
  /** Current lifecycle state of the call. */
  status: Guardian.enum(CALL_STATUSES),
  /** RFC 2822 timestamp the call began dialing; `null` until the call starts. */
  start_time: Guardian.string().nullable(),
  /** RFC 2822 timestamp the call ended; `null` while the call is ongoing. */
  end_time: Guardian.string().nullable(),
  /** Call length in seconds, as a string; `null` until the call has ended. */
  duration: Guardian.string().nullable(),
  /** Amount billed for the call, as a string; `null` until priced. */
  price: Guardian.string().nullable(),
  /** ISO 4217 currency code `price` is denominated in. */
  price_unit: Guardian.string().nullable(),
  /** Direction of the call relative to the account. */
  direction: Guardian.enum(CALL_DIRECTIONS),
  /**
   * Answering-machine-detection result (e.g. `human`, `machine_start`),
   * when the call was created with `machineDetection` enabled; `null`
   * otherwise. Not modelled as a strict enum — see the type doc above.
   */
  answered_by: Guardian.string().nullable(),
  /** Twilio API version used to process the call. */
  api_version: Guardian.string(),
  /** Original forwarded-from number, when the carrier supplies one. */
  forwarded_from: Guardian.string().nullable().optional(),
  /** SID of the call group this call belongs to, if any. */
  group_sid: Guardian.string().nullable().optional(),
  /** Caller's name from caller-ID lookup, when `VoiceCallerIdLookup` is enabled. */
  caller_name: Guardian.string().nullable().optional(),
  /** Milliseconds the call waited in queue before being placed, as a string. */
  queue_time: Guardian.string().nullable().optional(),
  /** SID of the SIP trunk that routed the call, if any. */
  trunk_sid: Guardian.string().nullable().optional(),
  /** SID of the call leg that created this one (e.g. via `<Dial>`), if any. */
  parent_call_sid: Guardian.string().nullable().optional(),
  /** RFC 2822 timestamp the resource was created. */
  date_created: Guardian.string(),
  /** RFC 2822 timestamp the resource was last updated. */
  date_updated: Guardian.string(),
  /** Relative URI of this resource. */
  uri: Guardian.string(),
  /** Relative URIs of subresources (e.g. `recordings`, `notifications`, `events`). */
  subresource_uris: Guardian.record(Guardian.string()),
}).describe({
  title: 'Call resource',
  description: 'A Twilio Call resource, returned by the Calls endpoint.',
});

/** Guardian schema that validates a {@link CallSchema}. */
export const CallSchemaObject: BaseGuardian<CallSchema> = _callSchema;
