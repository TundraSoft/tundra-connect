import { type BaseGuardian, Guardian } from '@guardian';
import { applicationSidGuard, byocTrunkSidGuard } from './Common.ts';

/** Documented `method`/`fallbackMethod`/`*CallbackMethod` values. */
const HTTP_METHODS = ['GET', 'POST'] as const;

/** Documented `statusCallbackEvent` values for Create a Call. */
const CALL_PROGRESS_EVENTS = [
  'initiated',
  'ringing',
  'answered',
  'completed',
] as const;

/** Documented `recordingStatusCallbackEvent` values. */
const RECORDING_STATUS_EVENTS = ['in-progress', 'completed', 'absent'] as const;

/**
 * Schema for {@link Twilio.createCall} request options
 *
 * Validates the camelCase options object accepted by `createCall()` before
 * it is translated into Twilio's PascalCase form-encoded fields for
 * `POST /2010-04-01/Accounts/{AccountSid}/Calls.json`. Twilio requires
 * `to` and `from`, plus exactly one of `url` / `twiml` / `applicationSid`
 * to supply the call's TwiML instructions — enforced here so a malformed
 * request never reaches the API.
 *
 * `to`/`from` are modelled as non-empty strings rather than E.164-only
 * (unlike the Messages resource's `to`): Twilio documents both as
 * `string<endpoint>`, accepting a phone number, a SIP address
 * (`sip:user@domain.com`), or a Client identifier (`client:name`).
 *
 * @example
 * ```typescript
 * import { CreateCallRequestSchemaObject } from '@tundraconnect/twilio/schemas';
 *
 * const [error, options] = CreateCallRequestSchemaObject.safeParse({
 *   to: '+14155552671',
 *   from: '+15017122661',
 *   url: 'http://demo.twilio.com/docs/voice.xml',
 * });
 * if (!error) {
 *   console.log('Valid request:', options.to);
 * }
 * ```
 */
export type CreateCallRequestSchema = {
  to: string;
  from: string;
  url?: string;
  twiml?: string;
  applicationSid?: string;
  method?: 'GET' | 'POST';
  fallbackUrl?: string;
  fallbackMethod?: 'GET' | 'POST';
  statusCallback?: string;
  statusCallbackEvent?: ('initiated' | 'ringing' | 'answered' | 'completed')[];
  statusCallbackMethod?: 'GET' | 'POST';
  sendDigits?: string;
  timeout?: number;
  record?: boolean;
  recordingChannels?: 'mono' | 'dual';
  recordingStatusCallback?: string;
  recordingStatusCallbackMethod?: 'GET' | 'POST';
  recordingStatusCallbackEvent?: ('in-progress' | 'completed' | 'absent')[];
  recordingConfigurationId?: string;
  sipAuthUsername?: string;
  sipAuthPassword?: string;
  machineDetection?: 'Enable' | 'DetectMessageEnd';
  machineDetectionTimeout?: number;
  machineDetectionSpeechThreshold?: number;
  machineDetectionSpeechEndThreshold?: number;
  machineDetectionSilenceTimeout?: number;
  trim?: 'trim-silence' | 'do-not-trim';
  callerId?: string;
  asyncAmd?: boolean;
  asyncAmdStatusCallback?: string;
  asyncAmdStatusCallbackMethod?: 'GET' | 'POST';
  passports?: string;
  byoc?: string;
  callReason?: string;
  callToken?: string;
  recordingTrack?: 'inbound' | 'outbound' | 'both';
  timeLimit?: number;
  clientNotificationUrl?: string;
};

const _createCallRequestSchema: BaseGuardian<CreateCallRequestSchema> = Guardian
  .object({
    /** Phone number, SIP address, Client identifier, or SIM SID to call. */
    to: Guardian.string().minLength(1),
    /** Caller ID: a Twilio phone number, verified caller ID, or Client identifier. Must be a phone number if `to` is a phone number. */
    from: Guardian.string().minLength(1),
    /** Absolute URL returning the TwiML instructions for the call. One of `url` / `twiml` / `applicationSid` is required. */
    url: Guardian.string().url().optional(),
    /** Inline TwiML instructions, used instead of fetching from `url` (max 4000 characters). One of `url` / `twiml` / `applicationSid` is required. */
    twiml: Guardian.string().maxLength(4000).optional(),
    /** Application SID whose configured URLs handle the call. One of `url` / `twiml` / `applicationSid` is required. */
    applicationSid: applicationSidGuard.optional(),
    /** HTTP method used to request `url`. Ignored when `applicationSid` is set. */
    method: Guardian.enum(HTTP_METHODS).optional(),
    /** URL requested if fetching/executing the TwiML at `url` fails. Ignored when `applicationSid` is set. */
    fallbackUrl: Guardian.string().url().optional(),
    /** HTTP method used to request `fallbackUrl`. Ignored when `applicationSid` is set. */
    fallbackMethod: Guardian.enum(HTTP_METHODS).optional(),
    /** Webhook URL Twilio calls with call status updates. Ignored when `applicationSid` is set. */
    statusCallback: Guardian.string().url().optional(),
    /** Call progress events to report to `statusCallback` (defaults to `completed` only if omitted). Ignored when `applicationSid` is set. */
    statusCallbackEvent: Guardian.array(Guardian.enum(CALL_PROGRESS_EVENTS))
      .minLength(
        1,
        'statusCallbackEvent must contain at least one event when supplied',
      )
      .optional(),
    /** HTTP method used to request `statusCallback`. Ignored when `applicationSid` is set. */
    statusCallbackMethod: Guardian.enum(HTTP_METHODS).optional(),
    /** DTMF digits to play after the call connects (`0`-`9`, `A`-`D`, `#`, `*`, `w`/`W` for pauses; max 32 characters). Ignored when `machineDetection` is also set. */
    sendDigits: Guardian.string().pattern(
      /^[0-9A-Da-d#*wW]{1,32}$/,
      "sendDigits must contain only '0'-'9', 'A'-'D', '#', '*', 'w', or 'W', up to 32 characters",
    ).optional(),
    /** Seconds to let the phone ring before assuming no answer (1-600, default 60). */
    timeout: Guardian.number().integer().min(1).max(600).optional(),
    /** Whether to record the call (default `false`). */
    record: Guardian.boolean().optional(),
    /** Recording channel layout: `mono` (both legs in one channel) or `dual` (one channel per leg). Default `mono`. */
    recordingChannels: Guardian.enum(['mono', 'dual'] as const).optional(),
    /** URL Twilio calls once the recording is available. */
    recordingStatusCallback: Guardian.string().url().optional(),
    /** HTTP method used to request `recordingStatusCallback`. */
    recordingStatusCallbackMethod: Guardian.enum(HTTP_METHODS).optional(),
    /** Recording status events that trigger `recordingStatusCallback` (default `completed`). */
    recordingStatusCallbackEvent: Guardian.array(
      Guardian.enum(RECORDING_STATUS_EVENTS),
    ).minLength(
      1,
      'recordingStatusCallbackEvent must contain at least one event when supplied',
    ).optional(),
    /** Identifier of a Recording Configuration to use when processing the recording. */
    recordingConfigurationId: Guardian.string().minLength(1).optional(),
    /** Username used to authenticate a SIP call. */
    sipAuthUsername: Guardian.string().minLength(1).optional(),
    /** Password used to authenticate a SIP call, paired with `sipAuthUsername`. */
    sipAuthPassword: Guardian.string().minLength(1).optional(),
    /** Enables answering-machine detection: `Enable` returns `answeredBy` as soon as it's known, `DetectMessageEnd` waits so a message can be left. Ignored when `sendDigits` is set. */
    machineDetection: Guardian.enum(['Enable', 'DetectMessageEnd'] as const)
      .optional(),
    /** Seconds to attempt machine detection before timing out with `answeredBy: 'unknown'` (default 30). */
    machineDetectionTimeout: Guardian.number().integer().min(1).optional(),
    /** Milliseconds of speech below which activity is classified as human rather than machine (1000-6000, default 2400). */
    machineDetectionSpeechThreshold: Guardian.number().integer().min(1000)
      .max(6000).optional(),
    /** Milliseconds of silence after speech at which the speech activity is considered complete (500-5000, default 1200). */
    machineDetectionSpeechEndThreshold: Guardian.number().integer().min(500)
      .max(5000).optional(),
    /** Milliseconds of initial silence after which `answeredBy: 'unknown'` is returned (2000-10000, default 5000). */
    machineDetectionSilenceTimeout: Guardian.number().integer().min(2000).max(
      10000,
    ).optional(),
    /** Whether to trim leading/trailing silence from the recording. Default `trim-silence`. */
    trim: Guardian.enum(['trim-silence', 'do-not-trim'] as const).optional(),
    /** Phone number, SIP address, or Client identifier presented as having made the call. */
    callerId: Guardian.string().minLength(1).optional(),
    /** Whether to run answering-machine detection asynchronously in the background instead of blocking call setup. */
    asyncAmd: Guardian.boolean().optional(),
    /** URL notified of the async answering-machine-detection result. */
    asyncAmdStatusCallback: Guardian.string().url().optional(),
    /** HTTP method used to request `asyncAmdStatusCallback`. */
    asyncAmdStatusCallbackMethod: Guardian.enum(HTTP_METHODS).optional(),
    /** Base64-encoded STIR/SHAKEN passport(s) for this call; up to 5, comma-separated. */
    passports: Guardian.string().minLength(1).optional(),
    /** SID of a BYOC (Bring Your Own Carrier) trunk to route the call through. Only meaningful when `to` is a phone number. */
    byoc: byocTrunkSidGuard.optional(),
    /** Reason for the outgoing call, presented on the called party's phone (Branded Calls, Beta). */
    callReason: Guardian.string().minLength(1).optional(),
    /** Token authorizing a forwarded call, taken from the `call_token` of the incoming call being forwarded. */
    callToken: Guardian.string().minLength(1).optional(),
    /** Audio track(s) to record: `inbound`, `outbound`, or `both` (default). */
    recordingTrack: Guardian.enum(['inbound', 'outbound', 'both'] as const)
      .optional(),
    /** Maximum call duration in seconds; Twilio ends the call once reached. */
    timeLimit: Guardian.number().integer().min(1).optional(),
    /** URL used to deliver a push call notification. */
    clientNotificationUrl: Guardian.string().url().optional(),
  }).refine(
    (data) =>
      Boolean(data.url) || Boolean(data.twiml) || Boolean(data.applicationSid),
    "One of 'url', 'twiml', or 'applicationSid' is required",
  ).describe({
    title: 'Create call request',
    description:
      'Options accepted by Twilio.createCall(), validated before the API call.',
  });

/** Guardian schema that validates a {@link CreateCallRequestSchema}. */
export const CreateCallRequestSchemaObject: BaseGuardian<
  CreateCallRequestSchema
> = _createCallRequestSchema;
