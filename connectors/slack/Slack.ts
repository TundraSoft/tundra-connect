import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { constantTimeEqual, signHMAC } from '@crypt';
import { type BaseGuardian, GuardianError } from '@guardian';
import {
  type ConversationHistoryRequestSchema,
  ConversationHistoryRequestSchemaObject,
  type ConversationHistoryResponseSchema,
  ConversationHistoryResponseSchemaObject,
  type DeleteMessageRequestSchema,
  DeleteMessageRequestSchemaObject,
  type DeleteMessageResponseSchema,
  DeleteMessageResponseSchemaObject,
  ErrorEnvelopeSchemaObject,
  GetUserInfoRequestSchemaObject,
  type GetUserInfoResponseSchema,
  GetUserInfoResponseSchemaObject,
  type ListConversationsRequestSchema,
  ListConversationsRequestSchemaObject,
  type ListConversationsResponseSchema,
  ListConversationsResponseSchemaObject,
  type PostMessageRequestSchema,
  PostMessageRequestSchemaObject,
  type PostMessageResponseSchema,
  PostMessageResponseSchemaObject,
  type UpdateMessageRequestSchema,
  UpdateMessageRequestSchemaObject,
  type UpdateMessageResponseSchema,
  UpdateMessageResponseSchemaObject,
} from './schema/mod.ts';
import { SlackError, type SlackErrorCode } from './errors/mod.ts';

/**
 * Maps Slack's documented `{ ok: false, error: '<string>' }` error strings
 * (see each method's own docs page under
 * https://docs.slack.dev/reference/methods/) to this connect's error
 * codes. A string not present here falls back to `UNKNOWN_ERROR` — the raw
 * string is always preserved on the thrown error's `vendorError` context
 * regardless of whether it was mapped.
 */
const VENDOR_ERROR_CODE_MAP: Record<string, SlackErrorCode> = {
  // Authentication / token failures.
  invalid_auth: 'AUTH_FAILED',
  not_authed: 'AUTH_FAILED',
  account_inactive: 'AUTH_FAILED',
  token_revoked: 'AUTH_FAILED',
  token_expired: 'AUTH_FAILED',

  // Permission failures.
  missing_scope: 'FORBIDDEN',
  no_permission: 'FORBIDDEN',
  access_denied: 'FORBIDDEN',
  restricted_action: 'FORBIDDEN',
  cant_update_message: 'FORBIDDEN',
  cant_delete_message: 'FORBIDDEN',
  user_not_visible: 'FORBIDDEN',
  ekm_access_denied: 'FORBIDDEN',

  // Resource-not-found failures.
  channel_not_found: 'NOT_FOUND',
  user_not_found: 'NOT_FOUND',
  message_not_found: 'NOT_FOUND',

  // Bot/user isn't a member of the target conversation.
  not_in_channel: 'NOT_IN_CHANNEL',

  // Reported inside the body, in addition to a genuine HTTP 429.
  ratelimited: 'RATE_LIMITED',
  rate_limited: 'RATE_LIMITED',

  // Vendor-side rejections of the request's shape/content.
  invalid_blocks: 'INVALID_REQUEST',
  invalid_cursor: 'INVALID_REQUEST',
  invalid_limit: 'INVALID_REQUEST',
  invalid_ts_oldest: 'INVALID_REQUEST',
  invalid_ts_latest: 'INVALID_REQUEST',
  msg_too_long: 'INVALID_REQUEST',
  no_text: 'INVALID_REQUEST',
  too_many_attachments: 'INVALID_REQUEST',
  is_archived: 'INVALID_REQUEST',

  // Vendor-side outages reported inside a 200 body.
  internal_error: 'SERVICE_UNAVAILABLE',
  service_unavailable: 'SERVICE_UNAVAILABLE',
  fatal_error: 'SERVICE_UNAVAILABLE',
};

/**
 * Slack authentication — a bot token sent as a standard Bearer header:
 * `Authorization: Bearer xoxb-...`. `RESTlerAuth`'s `BEARER` variant
 * already matches this exactly (Slack has no Basic/custom-header auth mode
 * to admit here), so this narrows it to the one shape Slack actually
 * accepts and no `_authInjector` override is needed — RESTler's base
 * implementation already emits the header correctly for `type: 'BEARER'`.
 */
export type SlackAuth = {
  type: 'BEARER';
  /** Slack bot token, e.g. `xoxb-...` (a user token, `xoxp-...`, also works for user-scoped calls). */
  token: string;
  /** Authorization header scheme prefix. Slack documents `Bearer`. */
  prefix?: string;
};

/** Options for configuring a {@link Slack} client. */
export type SlackOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link SlackAuth}. */
  auth: SlackAuth;
};

/**
 * Slack client for the Slack Web API (https://docs.slack.dev/apis/web-api).
 *
 * Covers sending, updating, and deleting a channel message, listing
 * conversations, paging through a conversation's history, and looking up a
 * user — the core surface for a bot posting notifications and reading back
 * what it (or others) posted. Rich Block Kit messages (`blocks`,
 * `attachments`) are intentionally out of scope for v1; `text` covers
 * plain-text messages fully and doubles as the fallback/accessibility text
 * for any future Block Kit support.
 *
 * **Slack's defining API quirk**: unlike almost every other connect in
 * this repository, Slack signals most documented failures with
 * `HTTP 200 OK` and `{ ok: false, error: '<short_error_code>' }` in the
 * body — not a 4xx/5xx status. `_responseHandler` therefore parses the
 * response body on *every* call (success and failure alike), not just
 * error-status ones — see {@link __toError}'s doc comment for the exact
 * precedence. A genuine `429` (with a `Retry-After` header) and a genuine
 * `5xx` are still handled as real HTTP failures ahead of body inspection.
 *
 * @example
 * ```typescript
 * import { Slack } from '@tundraconnect/slack';
 *
 * const client = new Slack({
 *   auth: { type: 'BEARER', token: 'xoxb-your-bot-token' },
 * });
 *
 * const sent = await client.postMessage({
 *   channel: 'C123ABC456',
 *   text: 'Deploy succeeded',
 * });
 * console.log(sent.ts);
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

/** Arguments to {@link Slack.verifyWebhook}. */
export type VerifyWebhookOptions = {
  /** The RAW request body, before any deserialization — JSON for Events API, form-encoded for slash commands. */
  payload: string;
  headers: WebhookHeadersLike;
  /** The app's Signing Secret, used as a UTF-8 string. */
  signingSecret: string;
  /** Replay window in seconds. @default 300 */
  toleranceSeconds?: number;
  /** Clock override, for tests. */
  nowMs?: number;
};

export class Slack extends RESTler<SlackOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Slack';

  /** The configured Slack bot (or user) token, read from `auth.token`. */
  get botToken(): string {
    return this._getOption('auth').token;
  }

  /**
   * Creates a new Slack client instance.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'BEARER', token, prefix? }` — your
   * Slack bot token as the Bearer token. RESTler's base `_authInjector`
   * already emits `Authorization: <prefix> <token>` for `type: 'BEARER'`,
   * so no auth override is needed here; `prefix` defaults to matching
   * Slack's documented `Bearer` casing when omitted.
   * @throws {SlackError} `CONFIG_INVALID_TOKEN` if `auth` is missing,
   * isn't `type: 'BEARER'`, or its `token` is blank or not a string.
   */
  constructor(options: EventOptionKeys<SlackOptions, RESTlerEvents>) {
    super(options, {
      baseURL: 'https://slack.com/api',
      timeout: 10,
      contentType: 'JSON',
    });
    // `auth` is required by the type, but `EventOptionKeys` makes every
    // option optional at the type level, so a caller that bypasses the
    // type checker (or builds options dynamically) can omit it entirely.
    // `_setOptions` only routes keys actually PRESENT on the constructor
    // argument through `_processOption`, so an absent `auth` slips past
    // the switch-based validation below and would otherwise only surface
    // as a raw auth failure on the first request. Fail fast here instead
    // — mirrors SendGrid's/OpenWeatherMap's own `baseURL`-style guard.
    if (!this._hasOption('auth')) {
      throw new SlackError('CONFIG_INVALID_TOKEN', {});
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Post a message into a channel via `POST /chat.postMessage`.
   *
   * `request` is validated against {@link PostMessageRequestSchema} before
   * anything is sent.
   *
   * @param request - The message to post; see {@link PostMessageRequestSchema}.
   * @returns Promise resolving to {@link PostMessageResponseSchema}.
   * @throws {SlackError} `INVALID_REQUEST` if `request` fails local schema
   * validation, or `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`,
   * `NOT_IN_CHANNEL`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * const sent = await client.postMessage({
   *   channel: 'C123ABC456',
   *   text: 'Deploy succeeded',
   * });
   * console.log(sent.ts);
   * ```
   */
  public async postMessage(
    request: PostMessageRequestSchema,
  ): Promise<PostMessageResponseSchema> {
    const [error, payload] = PostMessageRequestSchemaObject.safeParse(
      request,
    );
    if (error || !payload) {
      throw new SlackError('INVALID_REQUEST', {
        reason: error?.message ?? 'validation failed',
        responseError: error?.toJSON(),
      }, error ?? undefined);
    }

    return await this.__requestAndValidate(
      {
        path: '/chat.postMessage',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      PostMessageResponseSchemaObject,
    );
  }

  /**
   * Update an existing message's text via `POST /chat.update`.
   *
   * `request` is validated against {@link UpdateMessageRequestSchema}
   * before anything is sent. With a bot token, this can only update a
   * message the bot itself posted.
   *
   * @param request - The update to apply; see {@link UpdateMessageRequestSchema}.
   * @returns Promise resolving to {@link UpdateMessageResponseSchema}.
   * @throws {SlackError} `INVALID_REQUEST` if `request` fails local schema
   * validation, or `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`,
   * `NOT_IN_CHANNEL`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * const updated = await client.updateMessage({
   *   channel: 'C123ABC456',
   *   ts: '1401383885.000061',
   *   text: 'Updated text you carefully authored',
   * });
   * console.log(updated.text);
   * ```
   */
  public async updateMessage(
    request: UpdateMessageRequestSchema,
  ): Promise<UpdateMessageResponseSchema> {
    const [error, payload] = UpdateMessageRequestSchemaObject.safeParse(
      request,
    );
    if (error || !payload) {
      throw new SlackError('INVALID_REQUEST', {
        reason: error?.message ?? 'validation failed',
        responseError: error?.toJSON(),
      }, error ?? undefined);
    }

    return await this.__requestAndValidate(
      {
        path: '/chat.update',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      UpdateMessageResponseSchemaObject,
    );
  }

  /**
   * Delete a message via `POST /chat.delete`.
   *
   * `request` is validated against {@link DeleteMessageRequestSchema}
   * before anything is sent. With a bot token, this can only delete a
   * message the bot itself posted.
   *
   * @param request - The message to delete; see {@link DeleteMessageRequestSchema}.
   * @returns Promise resolving to {@link DeleteMessageResponseSchema}.
   * @throws {SlackError} `INVALID_REQUEST` if `request` fails local schema
   * validation, or `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`,
   * `NOT_IN_CHANNEL`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * await client.deleteMessage({
   *   channel: 'C123ABC456',
   *   ts: '1401383885.000061',
   * });
   * ```
   */
  public async deleteMessage(
    request: DeleteMessageRequestSchema,
  ): Promise<DeleteMessageResponseSchema> {
    const [error, payload] = DeleteMessageRequestSchemaObject.safeParse(
      request,
    );
    if (error || !payload) {
      throw new SlackError('INVALID_REQUEST', {
        reason: error?.message ?? 'validation failed',
        responseError: error?.toJSON(),
      }, error ?? undefined);
    }

    return await this.__requestAndValidate(
      {
        path: '/chat.delete',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      DeleteMessageResponseSchemaObject,
    );
  }

  /**
   * List conversations visible to the configured token via
   * `GET /conversations.list`.
   *
   * Cursor-paginated: pass the previous response's
   * `response_metadata.next_cursor` back as `cursor` to fetch the next
   * page; an absent/empty `next_cursor` means there is no further page.
   *
   * @param options - Filtering and pagination options; see {@link ListConversationsRequestSchema}.
   * @returns Promise resolving to {@link ListConversationsResponseSchema}.
   * @throws {SlackError} `INVALID_REQUEST` if `options` fails local schema
   * validation, or `AUTH_FAILED`, `FORBIDDEN`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR` for a
   * vendor-rejected or malformed response.
   *
   * @example
   * ```typescript
   * const { channels, response_metadata } = await client.listConversations({
   *   exclude_archived: true,
   *   limit: 200,
   * });
   * console.log(channels.map((c) => c.name));
   * console.log(response_metadata?.next_cursor);
   * ```
   */
  public async listConversations(
    options: ListConversationsRequestSchema = {},
  ): Promise<ListConversationsResponseSchema> {
    const [error, payload] = ListConversationsRequestSchemaObject.safeParse(
      options,
    );
    if (error || !payload) {
      throw new SlackError('INVALID_REQUEST', {
        reason: error?.message ?? 'validation failed',
        responseError: error?.toJSON(),
      }, error ?? undefined);
    }

    const query: Record<string, string> = {};
    if (payload.cursor !== undefined) query['cursor'] = payload.cursor;
    if (payload.limit !== undefined) query['limit'] = String(payload.limit);
    if (payload.exclude_archived !== undefined) {
      query['exclude_archived'] = String(payload.exclude_archived);
    }
    if (payload.types !== undefined) query['types'] = payload.types;

    return await this.__requestAndValidate(
      { path: '/conversations.list', method: 'GET', query },
      ListConversationsResponseSchemaObject,
    );
  }

  /**
   * Fetch a conversation's message history via
   * `GET /conversations.history`.
   *
   * Cursor-paginated: pass the previous response's
   * `response_metadata.next_cursor` back as `cursor` to fetch the next
   * page; `has_more` also indicates whether further pages remain.
   *
   * @param options - Which conversation and page to fetch; see {@link ConversationHistoryRequestSchema}.
   * @returns Promise resolving to {@link ConversationHistoryResponseSchema}.
   * @throws {SlackError} `INVALID_REQUEST` if `options` fails local schema
   * validation, or `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`,
   * `NOT_IN_CHANNEL`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * const { messages, has_more } = await client.getConversationHistory({
   *   channel: 'C123ABC456',
   *   limit: 50,
   * });
   * console.log(messages[0]?.text, has_more);
   * ```
   */
  public async getConversationHistory(
    options: ConversationHistoryRequestSchema,
  ): Promise<ConversationHistoryResponseSchema> {
    const [error, payload] = ConversationHistoryRequestSchemaObject
      .safeParse(options);
    if (error || !payload) {
      throw new SlackError('INVALID_REQUEST', {
        reason: error?.message ?? 'validation failed',
        responseError: error?.toJSON(),
      }, error ?? undefined);
    }

    const query: Record<string, string> = { channel: payload.channel };
    if (payload.cursor !== undefined) query['cursor'] = payload.cursor;
    if (payload.limit !== undefined) query['limit'] = String(payload.limit);
    if (payload.oldest !== undefined) query['oldest'] = payload.oldest;
    if (payload.latest !== undefined) query['latest'] = payload.latest;

    return await this.__requestAndValidate(
      { path: '/conversations.history', method: 'GET', query },
      ConversationHistoryResponseSchemaObject,
    );
  }

  /**
   * Look up a user via `GET /users.info`.
   *
   * @param user - The user id to look up.
   * @returns Promise resolving to {@link GetUserInfoResponseSchema}.
   * @throws {SlackError} `INVALID_REQUEST` if `user` is blank, or
   * `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR` for a
   * vendor-rejected or malformed response.
   *
   * @example
   * ```typescript
   * const { user } = await client.getUserInfo('U123ABC456');
   * console.log(user.real_name, user.profile?.email);
   * ```
   */
  public async getUserInfo(user: string): Promise<GetUserInfoResponseSchema> {
    const [error, payload] = GetUserInfoRequestSchemaObject.safeParse({
      user,
    });
    if (error || !payload) {
      throw new SlackError('INVALID_REQUEST', {
        reason: error?.message ?? 'validation failed',
        responseError: error?.toJSON(),
      }, error ?? undefined);
    }

    return await this.__requestAndValidate(
      {
        path: '/users.info',
        method: 'GET',
        query: { user: payload.user },
      },
      GetUserInfoResponseSchemaObject,
    );
  }

  /**
   * Processes and validates configuration options specific to the Slack
   * client before passing them to the parent class.
   *
   * @throws {SlackError} `CONFIG_INVALID_TOKEN` when `auth` is present but
   * isn't a `BEARER` auth with a non-empty `token`.
   */
  protected override _processOption<K extends keyof SlackOptions>(
    key: K,
    value: SlackOptions[K],
  ): SlackOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as SlackAuth;
        if (
          !auth || auth.type !== 'BEARER' ||
          typeof auth.token !== 'string' || auth.token.trim() === ''
        ) {
          // Never echo the raw `token` here (as a message placeholder or
          // as context) — it's a live Slack bot token, and `context` is
          // stored on the thrown error verbatim (see `BaseError.toJSON`),
          // so anything placed here is just as exposed as the message
          // text.
          throw new SlackError('CONFIG_INVALID_TOKEN', {});
        }
        value = {
          type: 'BEARER',
          token: auth.token.trim(),
          prefix: auth.prefix,
        } as SlackOptions[K];
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link SlackError} — so `SlackError` stays the only thing a
   * public method throws for "the vendor responded, but the body doesn't
   * match what was expected." `B` is inferred from `guard`, so callers no
   * longer separately write out a `_makeRequest<B>()` type argument.
   *
   * By the time a method calls this, {@link _responseHandler} has already
   * run and thrown for any documented vendor error (including Slack's own
   * `{ ok: false, error }` envelope) — this only has to handle a response
   * whose status/envelope looked fine but whose body doesn't match what
   * was expected.
   *
   * @template B - The expected response body type.
   * @param endpoint - The endpoint to request.
   * @param guard - Guardian schema object for validating the response.
   * @returns The validated response data.
   * @throws {SlackError} `RESPONSE_ERROR` when the body fails validation.
   */
  /**
   * Seconds a caller should wait before retrying after a 429, read from
   * whichever rate-limit header the vendor sent: `Retry-After` (delta
   * seconds or an HTTP-date), `X-RateLimit-Reset-After` (delta seconds),
   * or `X-RateLimit-Reset` / `RateLimit-Reset` (a Unix epoch in seconds or
   * milliseconds). `undefined` when none is present or parseable — the
   * value is only ever what the vendor said, never a guess.
   */
  private static __retryAfterSeconds(
    headers: Record<string, string> | undefined,
    nowMs = Date.now(),
  ): number | undefined {
    if (!headers) return undefined;
    const get = (name: string): string | undefined =>
      headers[name] ?? headers[name.toLowerCase()];
    const retryAfter = get('retry-after');
    if (retryAfter !== undefined) {
      const n = Number(retryAfter);
      if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
      const at = Date.parse(retryAfter);
      if (Number.isFinite(at)) {
        return Math.max(0, Math.ceil((at - nowMs) / 1000));
      }
    }
    const resetAfter = get('x-ratelimit-reset-after');
    if (resetAfter !== undefined) {
      const n = Number(resetAfter);
      if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
    }
    const reset = get('x-ratelimit-reset') ?? get('ratelimit-reset');
    if (reset !== undefined) {
      const n = Number(reset);
      if (Number.isFinite(n) && n > 0) {
        const epochMs = n > 1e12 ? n : n * 1000;
        return Math.max(0, Math.ceil((epochMs - nowMs) / 1000));
      }
    }
    return undefined;
  }

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
   * Verifies a request from Slack (Events API, slash commands,
   * interactivity) and returns the RAW body string once trusted.
   *
   * Slack's scheme: basestring `v0:<timestamp>:<rawBody>`, HMAC-SHA256
   * with the Signing Secret as UTF-8, hex, presented as `v0=<hex>` in
   * `X-Slack-Signature`, with `X-Slack-Request-Timestamp` bounded to five
   * minutes. The raw string is returned rather than a parsed object
   * because Slack bodies are JSON *or* form-encoded depending on the
   * feature — parse it yourself once this resolves.
   *
   * @throws {SlackError} `WEBHOOK_INVALID_HEADERS`,
   * `WEBHOOK_TIMESTAMP_INVALID`, or `WEBHOOK_SIGNATURE_INVALID`.
   *
   * @example
   * ```typescript
   * const raw = await req.text();
   * const body = await client.verifyWebhook({ payload: raw, headers: req.headers, signingSecret: SLACK_SIGNING_SECRET });
   * ```
   */
  public async verifyWebhook(options: VerifyWebhookOptions): Promise<string> {
    const {
      payload,
      headers,
      signingSecret,
      toleranceSeconds = 300,
      nowMs = Date.now(),
    } = options;
    const timestamp = Slack.__webhookHeader(
      headers,
      'x-slack-request-timestamp',
    );
    const signature = Slack.__webhookHeader(headers, 'x-slack-signature');
    if (!timestamp || !signature) {
      throw new SlackError('WEBHOOK_INVALID_HEADERS', {
        reason: `missing ${
          [
            !timestamp && 'X-Slack-Request-Timestamp',
            !signature && 'X-Slack-Signature',
          ].filter(Boolean).join(', ')
        }`,
      });
    }
    const sentAtSec = Number(timestamp);
    if (!Number.isFinite(sentAtSec)) {
      throw new SlackError('WEBHOOK_TIMESTAMP_INVALID', {
        reason: `'${timestamp}' is not a Unix timestamp in seconds`,
      });
    }
    // Both directions: a forged far-future timestamp would otherwise be
    // replayable forever.
    const driftSec = Math.abs(nowMs / 1000 - sentAtSec);
    if (driftSec > toleranceSeconds) {
      throw new SlackError('WEBHOOK_TIMESTAMP_INVALID', {
        reason: `${
          Math.round(driftSec)
        }s drift exceeds the ${toleranceSeconds}s tolerance`,
      });
    }
    const expected = `v0=${await signHMAC(
      `v0:${timestamp}:${payload}`,
      signingSecret,
    )}`;
    if (!constantTimeEqual(signature, expected)) {
      throw new SlackError('WEBHOOK_SIGNATURE_INVALID', {});
    }
    return payload;
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
        throw new SlackError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates Slack's
   * HTTP-status and `{ ok, error }`-envelope conventions into a
   * {@link SlackError}. Runs on every response (registered on
   * `_responseHandler` in the constructor).
   *
   * Precedence, checked in this order:
   *
   * 1. A genuine HTTP `429` — real HTTP-level rate limiting, complete with
   *    a `Retry-After` header — always throws `RATE_LIMITED`, regardless
   *    of what the body contains.
   * 2. A genuine HTTP `5xx` — a real outage, where Slack's own error page
   *    rarely follows its documented JSON envelope — always throws
   *    `SERVICE_UNAVAILABLE`.
   * 3. **Slack's defining quirk**: the body is parsed as
   *    `{ ok, error, warning }` even for an HTTP-successful status,
   *    because that's where almost every documented failure actually
   *    lives (`200 OK` with `ok: false`). `error` is mapped via
   *    {@link VENDOR_ERROR_CODE_MAP}, falling back to `UNKNOWN_ERROR` for
   *    an undocumented string — either way the raw string survives as
   *    `vendorError` on the thrown error's context.
   * 4. A genuine non-2xx status Slack didn't explain via its own envelope
   *    (e.g. an intermediating proxy's HTML error page, or a `404` for a
   *    mistyped path) falls back to `UNKNOWN_ERROR` with the raw status
   *    and body attached for diagnostics, rather than letting a
   *    non-JSON/non-`ok`-shaped body reach schema validation as if it
   *    were a successful response.
   * 5. Otherwise (a `< 400` — or `null` — status whose body isn't
   *    `ok: false`) the body is returned unchanged, leaving
   *    success-body validation to {@link __requestAndValidate}.
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {SlackError} `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, a
   * vendor-mapped code (`AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`,
   * `NOT_IN_CHANNEL`, `INVALID_REQUEST`, ...), or `UNKNOWN_ERROR`.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;

    // (1) Genuine HTTP-level rate limiting takes priority over body
    // inspection — a 429's body is not always Slack's own JSON (an
    // intermediating proxy may substitute its own rate-limit page).
    if (status === 429) {
      const retryAfterHeader = response.headers?.['retry-after'];
      const retryAfterNum = retryAfterHeader !== undefined
        ? Number(retryAfterHeader)
        : NaN;
      const [, envelope] = ErrorEnvelopeSchemaObject.safeParse(
        response.body,
      );
      throw new SlackError('RATE_LIMITED', {
        status,
        retryAfterSeconds: Slack.__retryAfterSeconds(response.headers),
        retryAfter: Number.isNaN(retryAfterNum) ? 'a few' : retryAfterNum,
        vendorError: envelope?.error,
      });
    }

    // (2) A genuine server-side outage — Slack's own error pages here
    // rarely follow its documented `{ ok, error }` JSON envelope.
    if (status !== null && status >= 500) {
      throw new SlackError('SERVICE_UNAVAILABLE', { status });
    }

    // (3) Slack's defining quirk: read the body even on an HTTP-successful
    // status, because that's where almost every documented failure lives.
    const [, envelope] = ErrorEnvelopeSchemaObject.safeParse(response.body);
    if (envelope?.ok === false) {
      const vendorError = envelope.error;
      const code = vendorError ? VENDOR_ERROR_CODE_MAP[vendorError] : undefined;
      throw new SlackError(code ?? 'UNKNOWN_ERROR', {
        status: status ?? undefined,
        vendorError,
        warning: envelope.warning,
      });
    }

    // (4) A genuine non-2xx status Slack didn't explain with its own
    // envelope.
    if (status !== null && status >= 400) {
      throw new SlackError('UNKNOWN_ERROR', { status, body: response.body });
    }

    // (5) Success: status < 400 (or null) and the body isn't `ok: false`.
    return response.body;
  }
}
