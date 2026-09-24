import {
  type ResponseBody,
  RESTler,
  type RESTlerAuth,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerRateLimitError,
  type RESTlerRequestOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { decodeHex, encodeBase64 } from '@encoding';
import { constantTimeEqual, sha256, signHMAC } from '@crypt';
import {
  accountSidGuard,
  type CallSchema,
  CallSchemaObject,
  callSidGuard,
  type CreateCallRequestSchema,
  CreateCallRequestSchemaObject,
  ErrorSchemaObject,
  type ListCallsRequestSchema,
  ListCallsRequestSchemaObject,
  type ListCallsResponseSchema,
  ListCallsResponseSchemaObject,
  type MessageSchema,
  MessageSchemaObject,
  type SendMessageRequestSchema,
  SendMessageRequestSchemaObject,
  type UpdateCallRequestSchema,
  UpdateCallRequestSchemaObject,
} from './schema/mod.ts';
import { TwilioError, type TwilioErrorCode } from './errors/mod.ts';
import { type BaseGuardian, GuardianError } from '@guardian';

/**
 * Maps Twilio's documented numeric error codes
 * (https://www.twilio.com/docs/api/errors) to this connect's error codes.
 * Codes not present here fall back to `RESPONSE_ERROR`. Shared by every
 * endpoint (Messages and Calls alike) — `__toError` doesn't distinguish
 * which resource a response came from.
 */
const VENDOR_ERROR_CODE_MAP: Record<number, TwilioErrorCode> = {
  20003: 'AUTH_FAILED',
  20429: 'RATE_LIMITED',
  21211: 'INVALID_TO_NUMBER',
  21606: 'NON_SMS_CAPABLE_FROM_NUMBER',
  21608: 'UNVERIFIED_TO_NUMBER',
  21610: 'UNSUBSCRIBED_RECIPIENT',
  21612: 'UNROUTABLE_TO_NUMBER',
  21614: 'NON_SMS_CAPABLE_TO_NUMBER',
  21408: 'INTERNATIONAL_PERMISSION_DENIED',
  // Voice (Calls resource) specific.
  21212: 'INVALID_FROM_NUMBER',
  21214: 'UNREACHABLE_TO_NUMBER',
  21219: 'UNVERIFIED_TO_NUMBER_VOICE',
  11200: 'TWIML_FETCH_FAILED',
  10001: 'ACCOUNT_SUSPENDED',
};

/** Options for configuring a {@link Twilio} client. */
export type TwilioOptions = RESTlerOptions & {
  /**
   * Twilio Account SID (`AC` followed by 32 hex characters). Always
   * required — used both in the request path and, when no API Key is
   * configured, as the Basic-Auth username.
   */
  accountSid: string;
  /**
   * Auth Token for the account, paired with `accountSid` as the Basic-Auth
   * credentials. Required unless `apiKeySid`/`apiKeySecret` are supplied.
   */
  authToken?: string;
  /**
   * API Key SID. Replaces `accountSid` as the Basic-Auth username when
   * paired with `apiKeySecret` — `accountSid` is still used in the request
   * path. Required together with `apiKeySecret`.
   */
  apiKeySid?: string;
  /** API Key Secret, paired with `apiKeySid`. */
  apiKeySecret?: string;
};

/**
 * Twilio client for the Twilio REST API — SMS/MMS via the Messages
 * resource, and voice calls via the Calls resource
 *
 * Authenticates with HTTP Basic Auth, built from either an Account SID +
 * Auth Token pair or an API Key SID + Secret pair (`accountSid` is always
 * required, since it is also part of every request path). There is a
 * single fixed base URL — Twilio has no separate sandbox host; test
 * credentials hit the same URL and are distinguished only by using
 * Twilio's "magic" test phone numbers.
 *
 * The Calls resource here covers create/fetch/list/update/delete — placing
 * and managing calls — not TwiML/IVR generation (the markup that tells
 * Twilio what a call should say/do), which is out of scope for this
 * connect.
 *
 * @example
 * ```typescript
 * import { Twilio } from '@tundraconnect/twilio';
 *
 * const client = new Twilio({
 *   accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
 *   authToken: 'your-auth-token',
 * });
 *
 * const message = await client.sendMessage({
 *   to: '+14155552671',
 *   from: '+15017122661',
 *   body: 'Hello from Twilio!',
 * });
 *
 * console.log(message.sid, message.status);
 *
 * const call = await client.createCall({
 *   to: '+14155552671',
 *   from: '+15017122661',
 *   url: 'http://demo.twilio.com/docs/voice.xml',
 * });
 *
 * console.log(call.sid, call.status);
 * ```
 */
/**
 * Anything a runtime hands you as request headers — a `Headers` instance or
 * a plain object. Lookup is case-insensitive either way, as HTTP header
 * names are.
 */
export type WebhookHeadersLike =
  | Headers
  | Record<string, string | string[] | undefined>;

/** Arguments to {@link Twilio.verifyWebhook}. */
export type VerifyWebhookOptions = {
  /**
   * The EXACT URL Twilio requested — scheme, host, path and query string as
   * received, never re-encoded. Twilio signs this string byte-for-byte.
   */
  url: string;
  headers: WebhookHeadersLike;
  /** The POST form parameters, for an `application/x-www-form-urlencoded` webhook. */
  params?: Record<string, string>;
  /** The RAW JSON body, for an `application/json` webhook (Twilio then puts a `bodySHA256` query param on the URL). */
  payload?: string;
  /**
   * The ACCOUNT auth token. Defaults to the configured `auth.password`
   * when this client uses account-SID/auth-token Basic auth. Required
   * explicitly under API-key auth — Twilio signs with the account token,
   * never the API-key secret.
   */
  authToken?: string;
};

export class Twilio extends RESTler<TwilioOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Twilio';

  /** Twilio Account SID configured for this client. */
  get accountSid(): string {
    return this._getOption('accountSid');
  }

  /**
   * Creates a new Twilio client instance
   *
   * Validates `accountSid` and the configured credential pair immediately —
   * an incomplete or malformed configuration throws {@link TwilioError}
   * here rather than failing on the first request.
   *
   * @param options - Configuration options for the client
   * @param options.accountSid - Twilio Account SID (`AC` + 32 hex characters)
   * @param options.authToken - Auth Token, paired with `accountSid`
   * @param options.apiKeySid - API Key SID, paired with `apiKeySecret`
   * @param options.apiKeySecret - API Key Secret, paired with `apiKeySid`
   *
   * @throws {TwilioError} `CONFIG_INVALID_ACCOUNT_SID` when `accountSid` is
   * missing or malformed, `CONFIG_INCOMPLETE_API_KEY` when only one of
   * `apiKeySid`/`apiKeySecret` is supplied, or `CONFIG_MISSING_CREDENTIALS`
   * when neither `authToken` nor a complete API Key pair is supplied.
   */
  constructor(options: EventOptionKeys<TwilioOptions, RESTlerEvents>) {
    const accountSid = options.accountSid;
    const [sidError] = accountSidGuard.safeParse(accountSid);
    if (sidError) {
      throw new TwilioError('CONFIG_INVALID_ACCOUNT_SID', { accountSid });
    }

    const apiKeySid = options.apiKeySid;
    const apiKeySecret = options.apiKeySecret;
    const authToken = options.authToken;
    const hasApiKeySid = typeof apiKeySid === 'string' && apiKeySid.length > 0;
    const hasApiKeySecret = typeof apiKeySecret === 'string' &&
      apiKeySecret.length > 0;
    if (hasApiKeySid !== hasApiKeySecret) {
      throw new TwilioError('CONFIG_INCOMPLETE_API_KEY', { accountSid });
    }

    let auth: RESTlerAuth;
    if (hasApiKeySid && hasApiKeySecret) {
      auth = {
        type: 'BASIC',
        username: apiKeySid as string,
        password: apiKeySecret as string,
      };
    } else if (typeof authToken === 'string' && authToken.length > 0) {
      auth = {
        type: 'BASIC',
        username: accountSid as string,
        password: authToken,
      };
    } else {
      throw new TwilioError('CONFIG_MISSING_CREDENTIALS', { accountSid });
    }

    super({ ...options, accountSid: accountSid as string, auth }, {
      baseURL: 'https://api.twilio.com',
      timeout: 10,
      contentType: 'FORM',
    });
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Send an SMS/MMS message via the Twilio Messages resource
   *
   * Validates `options` (requiring one of `from`/`messagingServiceSid` and
   * one of `body`/`mediaUrl`/`contentSid`), translates it into Twilio's
   * form-encoded field names, and posts it to
   * `POST /2010-04-01/Accounts/{AccountSid}/Messages.json`.
   *
   * @param options - Message options; see {@link SendMessageRequestSchema}.
   * @returns Promise resolving to {@link MessageSchema}.
   * @throws {TwilioError} `INVALID_REQUEST` when `options` fails local
   * validation; `AUTH_FAILED`, `RATE_LIMITED`, `INVALID_TO_NUMBER`,
   * `NON_SMS_CAPABLE_FROM_NUMBER`, `UNVERIFIED_TO_NUMBER`,
   * `UNSUBSCRIBED_RECIPIENT`, `UNROUTABLE_TO_NUMBER`,
   * `NON_SMS_CAPABLE_TO_NUMBER`, `INTERNATIONAL_PERMISSION_DENIED`,
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * const message = await client.sendMessage({
   *   to: '+14155552671',
   *   messagingServiceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
   *   body: 'Your order has shipped!',
   * });
   * console.log(message.status); // 'queued'
   * ```
   */
  public async sendMessage(
    options: SendMessageRequestSchema,
  ): Promise<MessageSchema> {
    const parsed = this.__parseRequest(
      SendMessageRequestSchemaObject,
      options,
      'validation failed',
    );

    const form = new FormData();
    form.set('To', parsed.to);
    if (parsed.from) form.set('From', parsed.from);
    if (parsed.messagingServiceSid) {
      form.set('MessagingServiceSid', parsed.messagingServiceSid);
    }
    if (parsed.body) form.set('Body', parsed.body);
    if (parsed.mediaUrl) {
      for (const url of parsed.mediaUrl) form.append('MediaUrl', url);
    }
    if (parsed.contentSid) form.set('ContentSid', parsed.contentSid);
    if (parsed.statusCallback) {
      form.set('StatusCallback', parsed.statusCallback);
    }
    if (parsed.applicationSid) {
      form.set('ApplicationSid', parsed.applicationSid);
    }
    if (parsed.validityPeriod !== undefined) {
      form.set('ValidityPeriod', String(parsed.validityPeriod));
    }
    if (parsed.smartEncoded !== undefined) {
      form.set('SmartEncoded', String(parsed.smartEncoded));
    }
    if (parsed.shortenUrls !== undefined) {
      form.set('ShortenUrls', String(parsed.shortenUrls));
    }
    if (parsed.scheduleType) form.set('ScheduleType', parsed.scheduleType);
    if (parsed.sendAt) form.set('SendAt', parsed.sendAt);
    if (parsed.contentVariables) {
      form.set('ContentVariables', parsed.contentVariables);
    }

    return await this.__requestAndValidate(
      {
        path: `/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        method: 'POST',
        contentType: 'FORM',
        payload: form,
      },
      MessageSchemaObject,
    );
  }

  /**
   * Create an outbound call via the Twilio Calls resource
   *
   * Validates `options` (requiring `to`, `from`, and one of
   * `url`/`twiml`/`applicationSid` to supply the call's TwiML), translates
   * it into Twilio's form-encoded field names, and posts it to
   * `POST /2010-04-01/Accounts/{AccountSid}/Calls.json`.
   *
   * @param options - Call options; see {@link CreateCallRequestSchema}.
   * @returns Promise resolving to {@link CallSchema}.
   * @throws {TwilioError} `INVALID_REQUEST` when `options` fails local
   * validation; `AUTH_FAILED`, `RATE_LIMITED`, `INVALID_TO_NUMBER`,
   * `INVALID_FROM_NUMBER`, `UNREACHABLE_TO_NUMBER`,
   * `UNVERIFIED_TO_NUMBER_VOICE`, `TWIML_FETCH_FAILED`,
   * `ACCOUNT_SUSPENDED`, `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a
   * vendor-rejected or malformed response.
   *
   * @example
   * ```typescript
   * const call = await client.createCall({
   *   to: '+14155552671',
   *   from: '+15017122661',
   *   url: 'http://demo.twilio.com/docs/voice.xml',
   * });
   * console.log(call.sid, call.status); // 'queued'
   * ```
   */
  public async createCall(
    options: CreateCallRequestSchema,
  ): Promise<CallSchema> {
    const parsed = this.__parseRequest(
      CreateCallRequestSchemaObject,
      options,
      'validation failed',
    );

    const form = new FormData();
    form.set('To', parsed.to);
    form.set('From', parsed.from);
    if (parsed.url) form.set('Url', parsed.url);
    if (parsed.twiml) form.set('Twiml', parsed.twiml);
    if (parsed.applicationSid) {
      form.set('ApplicationSid', parsed.applicationSid);
    }
    if (parsed.method) form.set('Method', parsed.method);
    if (parsed.fallbackUrl) form.set('FallbackUrl', parsed.fallbackUrl);
    if (parsed.fallbackMethod) {
      form.set('FallbackMethod', parsed.fallbackMethod);
    }
    if (parsed.statusCallback) {
      form.set('StatusCallback', parsed.statusCallback);
    }
    if (parsed.statusCallbackEvent) {
      for (const event of parsed.statusCallbackEvent) {
        form.append('StatusCallbackEvent', event);
      }
    }
    if (parsed.statusCallbackMethod) {
      form.set('StatusCallbackMethod', parsed.statusCallbackMethod);
    }
    if (parsed.sendDigits) form.set('SendDigits', parsed.sendDigits);
    if (parsed.timeout !== undefined) {
      form.set('Timeout', String(parsed.timeout));
    }
    if (parsed.record !== undefined) form.set('Record', String(parsed.record));
    if (parsed.recordingChannels) {
      form.set('RecordingChannels', parsed.recordingChannels);
    }
    if (parsed.recordingStatusCallback) {
      form.set('RecordingStatusCallback', parsed.recordingStatusCallback);
    }
    if (parsed.recordingStatusCallbackMethod) {
      form.set(
        'RecordingStatusCallbackMethod',
        parsed.recordingStatusCallbackMethod,
      );
    }
    if (parsed.recordingStatusCallbackEvent) {
      for (const event of parsed.recordingStatusCallbackEvent) {
        form.append('RecordingStatusCallbackEvent', event);
      }
    }
    if (parsed.recordingConfigurationId) {
      form.set('RecordingConfigurationId', parsed.recordingConfigurationId);
    }
    if (parsed.sipAuthUsername) {
      form.set('SipAuthUsername', parsed.sipAuthUsername);
    }
    if (parsed.sipAuthPassword) {
      form.set('SipAuthPassword', parsed.sipAuthPassword);
    }
    if (parsed.machineDetection) {
      form.set('MachineDetection', parsed.machineDetection);
    }
    if (parsed.machineDetectionTimeout !== undefined) {
      form.set(
        'MachineDetectionTimeout',
        String(parsed.machineDetectionTimeout),
      );
    }
    if (parsed.machineDetectionSpeechThreshold !== undefined) {
      form.set(
        'MachineDetectionSpeechThreshold',
        String(parsed.machineDetectionSpeechThreshold),
      );
    }
    if (parsed.machineDetectionSpeechEndThreshold !== undefined) {
      form.set(
        'MachineDetectionSpeechEndThreshold',
        String(parsed.machineDetectionSpeechEndThreshold),
      );
    }
    if (parsed.machineDetectionSilenceTimeout !== undefined) {
      form.set(
        'MachineDetectionSilenceTimeout',
        String(parsed.machineDetectionSilenceTimeout),
      );
    }
    if (parsed.trim) form.set('Trim', parsed.trim);
    if (parsed.callerId) form.set('CallerId', parsed.callerId);
    if (parsed.asyncAmd !== undefined) {
      form.set('AsyncAmd', String(parsed.asyncAmd));
    }
    if (parsed.asyncAmdStatusCallback) {
      form.set('AsyncAmdStatusCallback', parsed.asyncAmdStatusCallback);
    }
    if (parsed.asyncAmdStatusCallbackMethod) {
      form.set(
        'AsyncAmdStatusCallbackMethod',
        parsed.asyncAmdStatusCallbackMethod,
      );
    }
    if (parsed.passports) form.set('Passports', parsed.passports);
    if (parsed.byoc) form.set('Byoc', parsed.byoc);
    if (parsed.callReason) form.set('CallReason', parsed.callReason);
    if (parsed.callToken) form.set('CallToken', parsed.callToken);
    if (parsed.recordingTrack) {
      form.set('RecordingTrack', parsed.recordingTrack);
    }
    if (parsed.timeLimit !== undefined) {
      form.set('TimeLimit', String(parsed.timeLimit));
    }
    if (parsed.clientNotificationUrl) {
      form.set('ClientNotificationUrl', parsed.clientNotificationUrl);
    }

    return await this.__requestAndValidate(
      {
        path: `/2010-04-01/Accounts/${this.accountSid}/Calls.json`,
        method: 'POST',
        contentType: 'FORM',
        payload: form,
      },
      CallSchemaObject,
    );
  }

  /**
   * Fetch a single Call resource by SID
   *
   * `GET /2010-04-01/Accounts/{AccountSid}/Calls/{Sid}.json`
   *
   * @param callSid - Call SID (`CA` + 32 hex characters).
   * @returns Promise resolving to {@link CallSchema}.
   * @throws {TwilioError} `INVALID_REQUEST` when `callSid` is malformed; a
   * vendor-mapped code (see {@link Twilio.createCall}'s throws),
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * const call = await client.getCall('CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
   * console.log(call.status);
   * ```
   */
  public async getCall(callSid: string): Promise<CallSchema> {
    const parsedSid = this.__parseRequest(
      callSidGuard,
      callSid,
      `'${callSid}' is not a valid Call SID`,
    );

    return await this.__requestAndValidate(
      {
        path: `/2010-04-01/Accounts/${this.accountSid}/Calls/${parsedSid}.json`,
        method: 'GET',
      },
      CallSchemaObject,
    );
  }

  /**
   * List Call resources, optionally filtered
   *
   * `GET /2010-04-01/Accounts/{AccountSid}/Calls.json`
   *
   * @param options - Filter/pagination options; see
   * {@link ListCallsRequestSchema}. All fields are optional.
   * @returns Promise resolving to {@link ListCallsResponseSchema} — one
   * page of calls plus pagination metadata, including a convenience
   * `nextPageToken` (Twilio's `PageToken` cursor, extracted from
   * `next_page_uri`). Pass it back as `options.pageToken` to fetch the
   * following page; it's `undefined` on the last page.
   * @throws {TwilioError} `INVALID_REQUEST` when `options` fails local
   * validation; a vendor-mapped code (see {@link Twilio.createCall}'s
   * throws), `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a
   * vendor-rejected or malformed response.
   *
   * @example
   * ```typescript
   * const page = await client.listCalls({ status: 'completed', pageSize: 20 });
   * for (const call of page.calls) console.log(call.sid, call.status);
   * ```
   *
   * @example Paging through every result
   * ```typescript
   * let pageToken: string | undefined;
   * do {
   *   const page = await client.listCalls({ status: 'completed', pageToken });
   *   for (const call of page.calls) console.log(call.sid, call.status);
   *   pageToken = page.nextPageToken;
   * } while (pageToken);
   * ```
   */
  public async listCalls(
    options: ListCallsRequestSchema = {},
  ): Promise<ListCallsResponseSchema> {
    const parsed = this.__parseRequest(
      ListCallsRequestSchemaObject,
      options,
      'validation failed',
    );

    const query: Record<string, string> = {};
    if (parsed.to) query['To'] = parsed.to;
    if (parsed.from) query['From'] = parsed.from;
    if (parsed.parentCallSid) query['ParentCallSid'] = parsed.parentCallSid;
    if (parsed.status) query['Status'] = parsed.status;
    if (parsed.startTime) query['StartTime'] = parsed.startTime;
    if (parsed.startTimeBefore) {
      query['StartTime<'] = parsed.startTimeBefore;
    }
    if (parsed.startTimeAfter) query['StartTime>'] = parsed.startTimeAfter;
    if (parsed.endTime) query['EndTime'] = parsed.endTime;
    if (parsed.endTimeBefore) query['EndTime<'] = parsed.endTimeBefore;
    if (parsed.endTimeAfter) query['EndTime>'] = parsed.endTimeAfter;
    if (parsed.pageSize !== undefined) {
      query['PageSize'] = String(parsed.pageSize);
    }
    if (parsed.page !== undefined) query['Page'] = String(parsed.page);
    if (parsed.pageToken) query['PageToken'] = parsed.pageToken;

    return await this.__requestAndValidate(
      {
        path: `/2010-04-01/Accounts/${this.accountSid}/Calls.json`,
        method: 'GET',
        query,
      },
      ListCallsResponseSchemaObject,
    );
  }

  /**
   * Update a live call — redirect it to new TwiML, or end it
   *
   * `POST /2010-04-01/Accounts/{AccountSid}/Calls/{Sid}.json`
   *
   * Real-time call modification: redirect an in-progress call to a new
   * `url`/`twiml`, or set `status: 'canceled'` to end a call still
   * `queued`/`ringing` (before it's answered), or `status: 'completed'` to
   * hang up a call that's `in-progress`.
   *
   * @param callSid - Call SID (`CA` + 32 hex characters) to update.
   * @param options - Update options; see {@link UpdateCallRequestSchema}.
   * At least one field is required, and `statusCallback` requires `url` in
   * the same request (both enforced locally, matching Twilio's documented
   * constraints).
   * @returns Promise resolving to {@link CallSchema}.
   * @throws {TwilioError} `INVALID_REQUEST` when `callSid` or `options`
   * fails local validation; a vendor-mapped code (see
   * {@link Twilio.createCall}'s throws), `RESPONSE_ERROR`, or
   * `SERVICE_UNAVAILABLE` for a vendor-rejected or malformed response.
   *
   * @example
   * ```typescript
   * // End an in-progress call.
   * await client.updateCall('CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', {
   *   status: 'completed',
   * });
   *
   * // Redirect a live call to new TwiML.
   * await client.updateCall('CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', {
   *   twiml: '<Response><Say>Please hold.</Say></Response>',
   * });
   * ```
   */
  public async updateCall(
    callSid: string,
    options: UpdateCallRequestSchema,
  ): Promise<CallSchema> {
    const parsedSid = this.__parseRequest(
      callSidGuard,
      callSid,
      `'${callSid}' is not a valid Call SID`,
    );

    const parsed = this.__parseRequest(
      UpdateCallRequestSchemaObject,
      options,
      'validation failed',
    );

    const form = new FormData();
    if (parsed.url) form.set('Url', parsed.url);
    if (parsed.method) form.set('Method', parsed.method);
    if (parsed.status) form.set('Status', parsed.status);
    if (parsed.fallbackUrl) form.set('FallbackUrl', parsed.fallbackUrl);
    if (parsed.fallbackMethod) {
      form.set('FallbackMethod', parsed.fallbackMethod);
    }
    if (parsed.statusCallback) {
      form.set('StatusCallback', parsed.statusCallback);
    }
    if (parsed.statusCallbackMethod) {
      form.set('StatusCallbackMethod', parsed.statusCallbackMethod);
    }
    if (parsed.twiml) form.set('Twiml', parsed.twiml);
    if (parsed.timeLimit !== undefined) {
      form.set('TimeLimit', String(parsed.timeLimit));
    }

    return await this.__requestAndValidate(
      {
        path: `/2010-04-01/Accounts/${this.accountSid}/Calls/${parsedSid}.json`,
        method: 'POST',
        contentType: 'FORM',
        payload: form,
      },
      CallSchemaObject,
    );
  }

  /**
   * Delete a Call resource's record
   *
   * `DELETE /2010-04-01/Accounts/{AccountSid}/Calls/{Sid}.json`
   *
   * This deletes the call detail record (and its associated call events)
   * from the account's logs — it does **not** terminate a live call; use
   * {@link Twilio.updateCall} with `status: 'completed'`/`'canceled'` for
   * that. Twilio responds `204 No Content` with no body on success, and
   * rejects the request if the call is still actively in progress.
   * Associated recordings and transcriptions are not deleted.
   *
   * @param callSid - Call SID (`CA` + 32 hex characters) to delete.
   * @throws {TwilioError} `INVALID_REQUEST` when `callSid` is malformed; a
   * vendor-mapped code (see {@link Twilio.createCall}'s throws),
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected
   * response.
   *
   * @example
   * ```typescript
   * await client.deleteCall('CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
   * ```
   */
  public async deleteCall(callSid: string): Promise<void> {
    const parsedSid = this.__parseRequest(
      callSidGuard,
      callSid,
      `'${callSid}' is not a valid Call SID`,
    );

    await this._makeRequest<unknown>({
      path: `/2010-04-01/Accounts/${this.accountSid}/Calls/${parsedSid}.json`,
      method: 'DELETE',
    });
  }

  /**
   * Validates the `accountSid` option's format.
   *
   * @param key - The option key to process
   * @param value - The option value to process
   * @returns The processed option value
   * @throws {TwilioError} `CONFIG_INVALID_ACCOUNT_SID` when `accountSid` is malformed
   * @protected
   */
  protected override _processOption<K extends keyof TwilioOptions>(
    key: K,
    value: TwilioOptions[K],
  ): TwilioOptions[K] {
    if (key === 'accountSid') {
      const [error] = accountSidGuard.safeParse(value);
      if (error) {
        throw new TwilioError('CONFIG_INVALID_ACCOUNT_SID', {
          accountSid: value,
        });
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Validates `value` against `guard`, unwrapping a failed parse into a
   * {@link TwilioError} `INVALID_REQUEST` — the shared shape behind every
   * local (pre-request) validation in this connect, whether it's an
   * options object or a single field like a Call SID.
   *
   * @template T - The expected parsed type
   * @param guard - Guardian schema to validate `value` against
   * @param value - The value to validate
   * @param fallbackReason - Reason to use when the guard error carries no
   * message of its own
   * @returns The validated/parsed value
   * @throws {TwilioError} `INVALID_REQUEST` when `value` fails validation
   *
   * @private
   */
  private __parseRequest<T>(
    guard: BaseGuardian<T>,
    value: unknown,
    fallbackReason: string,
  ): T {
    const [error, parsed] = guard.safeParse(value);
    if (error || !parsed) {
      throw new TwilioError('INVALID_REQUEST', {
        reason: error?.message ?? fallbackReason,
        responseError: (error as GuardianError | null)?.toJSON(),
      });
    }
    return parsed;
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link TwilioError} — so `TwilioError` stays the only thing a
   * public method throws for "the vendor responded, but the body doesn't
   * match what was expected." `B` is inferred from `guard`, so callers no
   * longer separately write out a `_makeRequest<B>()` type argument.
   *
   * By the time a method calls this, {@link _responseHandler} has already
   * run and thrown for any documented vendor error — this only has to
   * handle a response whose status looked fine but whose body doesn't match
   * what was expected.
   *
   * @template B - The expected response body type
   * @param endpoint - The endpoint to request
   * @param guard - Guardian schema object for validating the response
   * @returns The validated response data
   * @throws {TwilioError} `RESPONSE_ERROR` when the body fails validation
   *
   * @private
   */

  /** Case-insensitive single-header lookup across both {@link WebhookHeadersLike} shapes. */
  private static __webhookHeader(
    headers: WebhookHeadersLike,
    name: string,
  ): string | null {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      return headers.get(name);
    }
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== lower) continue;
      return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
    }
    return null;
  }

  /**
   * Single choke point for turning RESTler's `RESTlerRateLimitError` (thrown
   * when `maxRetryWait` is set and the retry was exhausted, or the vendor's
   * hint exceeded the cap) into this connect's own `RATE_LIMITED`. Every request
   * path goes through here — including methods whose result comes from
   * response headers and so call `_makeRequest` directly instead of
   * {@link __requestAndValidate}. Rewrapping only inside that helper
   * leaked the raw RESTler error from those methods.
   */
  protected override async _makeRequest<H = ResponseBody, B = H>(
    endpoint: RESTlerEndpoint,
    options: RESTlerRequestOptions<H, B> = {},
  ): Promise<RESTlerResponse<B>> {
    try {
      return await super._makeRequest<H, B>(endpoint, options);
    } catch (err) {
      throw this.__rateLimitError(err);
    }
  }

  /**
   * `err` rewrapped as `RATE_LIMITED` when it is a `RESTlerRateLimitError` — with
   * the vendor's hint and whether RESTler already waited once — or returned
   * unchanged otherwise.
   */
  private __rateLimitError(err: unknown): unknown {
    if (!(err instanceof RESTlerRateLimitError)) return err;
    return new TwilioError('RATE_LIMITED', {
      status: 429,
      retryAfterSeconds: err.getContextValue('retryAfter'),
      retried: err.getContextValue('retried'),
    }, err);
  }

  /**
   * Verifies a Twilio webhook's `X-Twilio-Signature`.
   *
   * Twilio's scheme: HMAC-SHA1 over the exact request URL followed by every
   * POST parameter as `key` immediately followed by `value`, sorted by key,
   * no separators; keyed by the ACCOUNT auth token; base64 output. For a
   * JSON body Twilio instead appends `bodySHA256=<hex>` to the URL — this
   * method checks that hash against `payload` (constant-time) and signs the
   * URL alone, exactly as Twilio's own validator does.
   *
   * The HMAC runs through `@tundralibs/crypt` (`signHMAC`, SHA-1); its hex
   * output is re-encoded to the base64 Twilio presents. Resolves to
   * nothing on success — the caller already holds the parameters.
   *
   * @throws {TwilioError} `WEBHOOK_INVALID_HEADERS`,
   * `WEBHOOK_INVALID_AUTH_TOKEN`, or `WEBHOOK_SIGNATURE_INVALID`.
   *
   * @example
   * ```typescript
   * // Form webhook (SMS status callback):
   * await client.verifyWebhook({ url: req.url, headers: req.headers, params });
   * // JSON webhook:
   * await client.verifyWebhook({ url: req.url, headers: req.headers, payload: await req.text() });
   * ```
   */
  public async verifyWebhook(options: VerifyWebhookOptions): Promise<void> {
    const { url, headers, params = {}, payload } = options;
    // Both auth modes are Basic on the wire, so `type` alone cannot tell
    // them apart: under API-key auth the password is the API-key SECRET,
    // which Twilio does NOT sign with. Only default to the configured
    // password when the username is the account SID — i.e. account-SID /
    // auth-token mode — and otherwise insist on an explicit token.
    const auth = this._getOption('auth') as {
      type: string;
      username?: string;
      password?: string;
    };
    const authToken = options.authToken ??
      (auth.type === 'BASIC' && auth.username === this.accountSid
        ? auth.password
        : undefined);
    if (!authToken) {
      throw new TwilioError('WEBHOOK_INVALID_AUTH_TOKEN', {});
    }
    const signature = Twilio.__webhookHeader(headers, 'x-twilio-signature');
    if (!signature) {
      throw new TwilioError('WEBHOOK_INVALID_HEADERS', {
        reason: 'missing X-Twilio-Signature',
      });
    }
    let data = url;
    if (payload !== undefined) {
      const bodyHash = new URL(url).searchParams.get('bodySHA256');
      if (!bodyHash) {
        throw new TwilioError('WEBHOOK_INVALID_HEADERS', {
          reason:
            'a JSON webhook URL must carry the bodySHA256 query parameter',
        });
      }
      if (
        !constantTimeEqual(await sha256(payload, 'hex'), bodyHash.toLowerCase())
      ) {
        throw new TwilioError('WEBHOOK_SIGNATURE_INVALID', {});
      }
    } else {
      for (const key of Object.keys(params).sort()) data += key + params[key];
    }
    const hex = await signHMAC(data, authToken, { hashAlgorithm: 'SHA-1' });
    // Twilio presents the HMAC as base64; re-encode crypt's hex output.
    const expected = encodeBase64(decodeHex(hex));
    if (!constantTimeEqual(signature, expected)) {
      throw new TwilioError('WEBHOOK_SIGNATURE_INVALID', {});
    }
  }

  private async __requestAndValidate<B>(
    endpoint: RESTlerEndpoint,
    guard: BaseGuardian<B>,
  ): Promise<B> {
    try {
      const resp = await this._makeRequest(endpoint, {
        responseSchema: (data) => guard.parse(data),
      });
      return resp.body as B;
    } catch (err) {
      if (err instanceof RESTlerResponseValidationError) {
        throw new TwilioError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates Twilio's
   * documented error envelope into a {@link TwilioError}. Runs on every
   * response (registered on `_responseHandler` in the constructor): a 4xx
   * body is parsed as the Twilio error envelope and its documented `code`
   * mapped to a specific {@link TwilioError}; anything else that looks like
   * an error (5xx, or an unparseable 4xx error body) surfaces as
   * `SERVICE_UNAVAILABLE`. Does nothing for a successful response, leaving
   * body validation to {@link __parse}.
   *
   * @param response - The parsed response, before any schema validation
   * @throws {TwilioError} A vendor-mapped code, `RESPONSE_ERROR`, or
   * `SERVICE_UNAVAILABLE`, matching the vendor's documented status/code
   * pairs.
   *
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;

    if (status !== null && status < 400) return response.body;

    if (status !== null && status >= 400 && status < 500) {
      const [err, body] = ErrorSchemaObject.safeParse(response.body);
      if (err || !body) {
        // Unparseable error body — can't reliably diagnose the failure.
        throw new TwilioError('SERVICE_UNAVAILABLE', {
          status: status,
          body: response.body,
          responseError: (err as GuardianError | null)?.toJSON(),
        });
      }
      const mapped = body.code !== undefined
        ? VENDOR_ERROR_CODE_MAP[body.code]
        : undefined;
      throw new TwilioError(mapped ?? 'RESPONSE_ERROR', {
        status: status,
        retryAfterSeconds: this._parseRetryAfter(response.headers),
        vendorCode: body.code,
        vendorMessage: body.message,
        moreInfo: body.more_info,
      });
    }

    // 5xx, or any other unexpected status.
    throw new TwilioError('SERVICE_UNAVAILABLE', {
      status: status,
      body: response.body,
    });
  }
}
