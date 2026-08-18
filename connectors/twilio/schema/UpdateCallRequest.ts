import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';

/** Documented `method`/`fallbackMethod`/`statusCallbackMethod` values. */
const HTTP_METHODS = ['GET', 'POST'] as const;

/**
 * Documented `status` values accepted by Update a Call — the only two
 * transitions Twilio allows via this endpoint: `canceled` ends a call
 * that is still `queued`/`ringing` (before it's answered), `completed`
 * hangs up a call that is `in-progress`.
 */
const UPDATE_CALL_STATUSES = ['canceled', 'completed'] as const;

/**
 * Schema for {@link Twilio.updateCall} request options
 *
 * Validates the camelCase options object accepted by `updateCall()` before
 * it is translated into Twilio's PascalCase form-encoded fields for
 * `POST /2010-04-01/Accounts/{AccountSid}/Calls/{Sid}.json`. This is the
 * "modify a live call" endpoint: redirect an in-progress call to new TwiML
 * (`url`/`method` or `twiml`) or end it (`status`). Confirmed against
 * Twilio's own "Update a Call" reference — every field below (and no
 * others) is documented there; in particular `statusCallbackEvent`,
 * `recordingChannels`, and the other Create-only fields are **not**
 * accepted on update.
 *
 * At least one field must be supplied — Twilio has no documented no-op
 * update — and per Twilio's documented constraint, setting `statusCallback`
 * requires `url` in the same request.
 *
 * @example
 * ```typescript
 * import { UpdateCallRequestSchemaObject } from '@tundraconnect/twilio/schemas';
 *
 * const [error, options] = UpdateCallRequestSchemaObject.safeParse({
 *   status: 'completed',
 * });
 * if (!error) {
 *   console.log('Valid update:', options.status);
 * }
 * ```
 */
type _UpdateCallRequestShape = {
  url?: string;
  method?: (typeof HTTP_METHODS)[number];
  status?: (typeof UPDATE_CALL_STATUSES)[number];
  fallbackUrl?: string;
  fallbackMethod?: (typeof HTTP_METHODS)[number];
  statusCallback?: string;
  statusCallbackMethod?: (typeof HTTP_METHODS)[number];
  twiml?: string;
  timeLimit?: number;
};

const _updateCallRequestSchema: BaseGuardian<_UpdateCallRequestShape> = Guardian
  .object({
    /** Absolute URL returning new TwiML instructions to redirect the live call to. */
    url: Guardian.string().url().optional(),
    /** HTTP method used to request `url`. Ignored when `applicationSid` was used to create the call. */
    method: Guardian.enum(HTTP_METHODS).optional(),
    /** `canceled` ends a queued/ringing call before it's answered; `completed` hangs up an in-progress call. */
    status: Guardian.enum(UPDATE_CALL_STATUSES).optional(),
    /** URL requested if fetching/executing the TwiML at `url` fails. */
    fallbackUrl: Guardian.string().url().optional(),
    /** HTTP method used to request `fallbackUrl`. */
    fallbackMethod: Guardian.enum(HTTP_METHODS).optional(),
    /** Webhook URL Twilio calls with status updates. Twilio requires `url` to also be set in the same request when this is supplied. */
    statusCallback: Guardian.string().url().optional(),
    /** HTTP method used to request `statusCallback`. */
    statusCallbackMethod: Guardian.enum(HTTP_METHODS).optional(),
    /** Inline TwiML instructions to redirect the live call to, used instead of fetching from `url`. Mutually exclusive with `url`. */
    twiml: Guardian.string().maxLength(4000).optional(),
    /** New maximum call duration in seconds. */
    timeLimit: Guardian.number().integer().min(1).optional(),
  }).refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    'At least one field must be supplied to update a call',
  ).refine(
    (data) => !data.statusCallback || Boolean(data.url),
    "'url' is required in the same request when 'statusCallback' is supplied",
  ).describe({
    title: 'Update call request',
    description:
      'Options accepted by Twilio.updateCall(), validated before the API call.',
  });

/** Type definition for {@link Twilio.updateCall} request options. */
export type UpdateCallRequestSchema = GuardianInfer<
  typeof _updateCallRequestSchema
>;

export const UpdateCallRequestSchemaObject: BaseGuardian<
  UpdateCallRequestSchema
> = _updateCallRequestSchema;
