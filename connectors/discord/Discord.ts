import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, GuardianError } from '@guardian';
import {
  type ChannelMessageRequestSchema,
  ChannelMessageRequestSchemaObject,
  ErrorSchemaObject,
  type MessageSchema,
  MessageSchemaObject,
  parseWebhookUrl,
  RateLimitSchemaObject,
  snowflakeGuard,
  type WebhookMessageRequestSchema,
  WebhookMessageRequestSchemaObject,
  webhookTokenGuard,
  webhookUrlGuard,
} from './schema/mod.ts';
import { DiscordError, type DiscordErrorCode } from './errors/mod.ts';

/**
 * Maps Discord's documented numeric JSON error codes
 * (https://discord.com/developers/docs/topics/opcodes-and-status-codes#json-error-codes)
 * to this connect's error codes. Codes not present here fall back to the
 * HTTP-status-based code from {@link Discord.__errorCodeForStatus}.
 */
const VENDOR_ERROR_CODE_MAP: Record<number, DiscordErrorCode> = {
  0: 'GENERAL_ERROR',
  10003: 'UNKNOWN_CHANNEL',
  10008: 'UNKNOWN_MESSAGE',
  10015: 'UNKNOWN_WEBHOOK',
  30015: 'MAX_ATTACHMENTS',
  50001: 'MISSING_ACCESS',
  50006: 'EMPTY_MESSAGE',
  50007: 'CANNOT_MESSAGE_USER',
  50008: 'CHANNEL_NOT_TEXT',
  50013: 'MISSING_PERMISSIONS',
  50014: 'INVALID_AUTH_TOKEN',
  50027: 'INVALID_WEBHOOK_TOKEN',
  50035: 'INVALID_FORM_BODY',
  50045: 'FILE_TOO_LARGE',
};

/**
 * Options shared by every {@link Discord} client configuration, layered on
 * {@link RESTlerOptions} with `baseURL`/`auth` fixed internally (`baseURL`
 * is always Discord's API; `auth` is derived from `botToken`, when set, in
 * the constructor).
 */
type DiscordCommonOptions = Omit<RESTlerOptions, 'baseURL' | 'auth'>;

/** Configure the client to execute a channel webhook, addressed by its full URL. */
export type DiscordWebhookUrlOptions = DiscordCommonOptions & {
  /** Full webhook URL: `https://discord.com/api/webhooks/{webhook.id}/{webhook.token}`. */
  webhookUrl: string;
  webhookId?: never;
  webhookToken?: never;
  botToken?: never;
};

/** Configure the client to execute a channel webhook, addressed by its id + token. */
export type DiscordWebhookIdOptions = DiscordCommonOptions & {
  /**
   * The webhook's ID, from `https://discord.com/api/webhooks/{id}/{token}`
   * — a Discord snowflake (17-20 digit numeric string).
   */
  webhookId: string;
  /**
   * The webhook's token, from `https://discord.com/api/webhooks/{id}/{token}`
   * — a single URL path segment (no `/`, `?`, or `#`, and not `.`/`..`).
   */
  webhookToken: string;
  webhookUrl?: never;
  botToken?: never;
};

/** Configure the client to call the bot REST API with a bot token. */
export type DiscordBotOptions = DiscordCommonOptions & {
  /** Discord bot token, sent as `Authorization: Bot {token}` on every request. */
  botToken: string;
  webhookUrl?: never;
  webhookId?: never;
  webhookToken?: never;
};

/**
 * Configuration for a {@link Discord} client — a discriminated-by-shape
 * union: configure with EITHER a webhook (`webhookUrl`, or `webhookId` +
 * `webhookToken`) OR a bot token (`botToken`), never both, never neither.
 * The constructor re-validates this exclusivity at runtime (via
 * `DiscordError('CONFIG_MISSING_CREDENTIALS' | 'CONFIG_AMBIGUOUS_CREDENTIALS' | 'CONFIG_INCOMPLETE_WEBHOOK', ...)`),
 * since the compile-time `never` fields below only protect object-literal
 * call sites.
 */
export type DiscordOptions =
  | DiscordWebhookUrlOptions
  | DiscordWebhookIdOptions
  | DiscordBotOptions;

/**
 * Flat option bag `RESTler` actually stores. {@link Discord}'s constructor
 * validates the {@link DiscordOptions} union it's given — proving exactly
 * one integration mode is configured — before this internal shape is ever
 * built.
 */
type DiscordInternalOptions = RESTlerOptions & {
  webhookUrl?: string;
  webhookId?: string;
  webhookToken?: string;
  botToken?: string;
};

/**
 * Discord client covering the two REST integration surfaces used to send a
 * message into a channel:
 *
 * - **Webhook mode** (`webhookUrl`, or `webhookId` + `webhookToken`): calls
 *   `POST /webhooks/{id}/{token}`. The id + token embedded in the URL IS
 *   the credential — no `Authorization` header is sent.
 * - **Bot mode** (`botToken`): calls `POST /channels/{channelId}/messages`
 *   with `Authorization: Bot {token}`.
 *
 * Scoped to sending text/embed notifications — file uploads, message
 * components, stickers, and polls are out of scope for both modes.
 *
 * @example Webhook mode
 * ```typescript
 * import { Discord } from '@tundraconnect/discord';
 *
 * const client = new Discord({
 *   webhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abcDEF',
 * });
 *
 * await client.sendWebhookMessage({ content: 'Deploy succeeded' });
 * ```
 *
 * @example Bot mode
 * ```typescript
 * import { Discord } from '@tundraconnect/discord';
 *
 * const client = new Discord({ botToken: 'your-bot-token' });
 *
 * const message = await client.sendChannelMessage('234567890123456789', {
 *   content: 'Deploy succeeded',
 * });
 * console.log(message.id);
 * ```
 */
export class Discord extends RESTler<DiscordInternalOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Discord';

  /** Which integration mode this client is configured for. */
  get mode(): 'webhook' | 'bot' {
    return this.__hasNonEmptyOption('botToken') ? 'bot' : 'webhook';
  }

  /**
   * Creates a new Discord client instance.
   *
   * Validates that exactly one integration mode is configured immediately
   * — an incomplete, ambiguous, or empty configuration throws
   * {@link DiscordError} here rather than failing on the first request.
   *
   * @param options - Configuration options for the client; see {@link DiscordOptions}.
   * @throws {DiscordError} `CONFIG_INCOMPLETE_WEBHOOK` when only one of
   * `webhookId`/`webhookToken` is supplied, `CONFIG_MISSING_CREDENTIALS`
   * when neither a webhook nor a `botToken` is supplied,
   * `CONFIG_AMBIGUOUS_CREDENTIALS` when more than one mode is supplied,
   * `CONFIG_INVALID_WEBHOOK_URL` when `webhookUrl` doesn't match Discord's
   * documented webhook URL shape, `CONFIG_INVALID_WEBHOOK_ID` when
   * `webhookId` isn't a Discord snowflake ID, `CONFIG_INVALID_WEBHOOK_TOKEN`
   * when `webhookToken` isn't a single URL path segment, or
   * `CONFIG_INVALID_BOT_TOKEN` when `botToken` is present but not a
   * non-empty string.
   */
  constructor(options: DiscordOptions) {
    const hasWebhookUrl = typeof options.webhookUrl === 'string' &&
      options.webhookUrl.length > 0;
    const hasWebhookId = typeof options.webhookId === 'string' &&
      options.webhookId.length > 0;
    const hasWebhookToken = typeof options.webhookToken === 'string' &&
      options.webhookToken.length > 0;
    const hasBotToken = typeof options.botToken === 'string' &&
      options.botToken.length > 0;

    // Cross-field checks that a single-key `_processOption` switch can't
    // express — must run before `super()`, since `RESTler`'s constructor
    // (via `_setOptions`) is what routes each present key through
    // `_processOption` in the first place.
    if (hasWebhookId !== hasWebhookToken) {
      throw new DiscordError('CONFIG_INCOMPLETE_WEBHOOK', {});
    }
    if (hasWebhookUrl && (hasWebhookId || hasWebhookToken)) {
      throw new DiscordError('CONFIG_AMBIGUOUS_CREDENTIALS', {});
    }
    const isWebhookMode = hasWebhookUrl || (hasWebhookId && hasWebhookToken);
    const modeCount = (isWebhookMode ? 1 : 0) + (hasBotToken ? 1 : 0);
    if (modeCount === 0) {
      throw new DiscordError('CONFIG_MISSING_CREDENTIALS', {});
    }
    if (modeCount > 1) {
      throw new DiscordError('CONFIG_AMBIGUOUS_CREDENTIALS', {});
    }

    super(
      options as unknown as EventOptionKeys<
        DiscordInternalOptions,
        RESTlerEvents
      >,
      {
        baseURL: 'https://discord.com/api/v10',
        timeout: 30,
        contentType: 'JSON',
      },
    );

    // RESTler's base `_authInjector` already emits `Authorization: Bot
    // <token>` for `auth.type === 'BEARER'` with `prefix: 'Bot'` — set it
    // here (derived from the now-validated botToken) rather than
    // overriding `_authInjector`. Left unset entirely in webhook mode, so
    // no `Authorization` header is ever sent for a webhook request.
    if (hasBotToken) {
      this._setOption('auth', {
        type: 'BEARER',
        token: this._getOption('botToken') as string,
        prefix: 'Bot',
      });
    }

    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Execute the configured webhook, posting a message into its channel, via
   * `POST /webhooks/{webhook.id}/{webhook.token}`. No `Authorization`
   * header is sent — the id + token embedded in the configured webhook
   * URL/pair is the credential.
   *
   * Matches Discord's own default: with `wait` omitted/`false`, Discord
   * returns `204 No Content` and this resolves to `undefined`. Pass
   * `{ wait: true }` to have Discord wait for the message to be created
   * and return it.
   *
   * @param message - The message to send; see {@link WebhookMessageRequestSchema}.
   * @param params - `wait` to receive the created message back; `threadId`
   * to post into a thread on the webhook's channel instead of the channel
   * itself.
   * @returns The created {@link MessageSchema} when `params.wait` is
   * `true`; `undefined` otherwise.
   * @throws {DiscordError} `MODE_MISMATCH` if this client was configured
   * with a `botToken` instead of a webhook; `REQUEST_VALIDATION_ERROR` if
   * `message`/`params.threadId` fails local schema validation; otherwise a
   * vendor-mapped code such as `EMPTY_MESSAGE`, `UNKNOWN_WEBHOOK`,
   * `INVALID_WEBHOOK_TOKEN`, `INVALID_FORM_BODY`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE`.
   *
   * @example
   * ```typescript
   * await client.sendWebhookMessage({ content: 'Deploy succeeded' });
   *
   * const message = await client.sendWebhookMessage(
   *   { content: 'Deploy succeeded' },
   *   { wait: true },
   * );
   * console.log(message?.id);
   * ```
   */
  public async sendWebhookMessage(
    message: WebhookMessageRequestSchema,
    params: { wait?: boolean; threadId?: string } = {},
  ): Promise<MessageSchema | undefined> {
    this.__assertMode('webhook', 'sendWebhookMessage');

    const [payloadError, payload] = WebhookMessageRequestSchemaObject.safeParse(
      message,
    );
    if (payloadError || !payload) {
      throw new DiscordError('REQUEST_VALIDATION_ERROR', {
        reason: payloadError?.message ?? 'validation failed',
        responseError: payloadError?.toJSON(),
      }, payloadError ?? undefined);
    }

    const query: Record<string, string> = {};
    if (params.wait) query.wait = 'true';
    if (params.threadId !== undefined) {
      const [err] = snowflakeGuard.safeParse(params.threadId);
      if (err) {
        throw new DiscordError('REQUEST_VALIDATION_ERROR', {
          reason: 'params.threadId must be a Discord snowflake ID',
        });
      }
      query.thread_id = params.threadId;
    }

    const endpoint: RESTlerEndpoint = {
      path: this.__webhookPath(),
      method: 'POST',
      contentType: 'JSON',
      payload: payload as unknown as Record<string, unknown>,
      query,
    };

    // `_responseHandler` already threw for any documented vendor error by
    // this point. Discord's own default (`wait` falsy) returns `204 No
    // Content` — nothing to parse; only validate + return the body when the
    // caller asked Discord to wait for (and return) the created message.
    if (!params.wait) {
      await this._makeRequest<unknown>(endpoint);
      return undefined;
    }
    return await this.__requestAndValidate(endpoint, MessageSchemaObject);
  }

  /**
   * Send a message into a channel via the bot API, via
   * `POST /channels/{channelId}/messages`. Requires this client to be
   * configured with a `botToken`.
   *
   * @param channelId - Destination channel's snowflake ID.
   * @param message - The message to send; see {@link ChannelMessageRequestSchema}.
   * @returns Promise resolving to the created {@link MessageSchema}.
   * @throws {DiscordError} `MODE_MISMATCH` if this client was configured
   * with a webhook instead of a `botToken`; `REQUEST_VALIDATION_ERROR` if
   * `channelId`/`message` fails local schema validation; otherwise a
   * vendor-mapped code such as `UNKNOWN_CHANNEL`, `MISSING_PERMISSIONS`,
   * `EMPTY_MESSAGE`, `INVALID_FORM_BODY`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE`.
   *
   * @example
   * ```typescript
   * const message = await client.sendChannelMessage('234567890123456789', {
   *   content: 'Deploy succeeded',
   * });
   * console.log(message.id, message.timestamp);
   * ```
   */
  public async sendChannelMessage(
    channelId: string,
    message: ChannelMessageRequestSchema,
  ): Promise<MessageSchema> {
    this.__assertMode('bot', 'sendChannelMessage');

    const [idError] = snowflakeGuard.safeParse(channelId);
    if (idError) {
      throw new DiscordError('REQUEST_VALIDATION_ERROR', {
        reason: `channelId must be a Discord snowflake ID, got '${channelId}'`,
      });
    }

    const [payloadError, payload] = ChannelMessageRequestSchemaObject.safeParse(
      message,
    );
    if (payloadError || !payload) {
      throw new DiscordError('REQUEST_VALIDATION_ERROR', {
        reason: payloadError?.message ?? 'validation failed',
        responseError: payloadError?.toJSON(),
      }, payloadError ?? undefined);
    }

    return await this.__requestAndValidate(
      {
        path: `/channels/${channelId}/messages`,
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      MessageSchemaObject,
    );
  }

  /**
   * Validates configuration options specific to the Discord client before
   * passing them to the parent class.
   *
   * `RESTler`'s `_setOptions` (via `Options._setOptions`) routes every key
   * PRESENT on the options object through here — including ones whose
   * value is explicitly `undefined` (e.g. a shared/env-derived config
   * object that sets unused mode's keys to `undefined` rather than
   * omitting them). `undefined` is therefore treated as "this key wasn't
   * meaningfully supplied" and skipped here unconditionally: the
   * constructor's own `hasWebhookUrl`/`hasWebhookId`/`hasWebhookToken`/
   * `hasBotToken` cross-field checks (which already ignore `undefined`
   * the same way) are the sole source of truth for whether the selected
   * mode's config is valid.
   *
   * In id + token mode, `webhookId`/`webhookToken` are held to the same
   * shapes the `webhookUrl` pattern enforces on those two values
   * (`snowflakeGuard` and `webhookTokenGuard` respectively) — both are
   * interpolated into the `/webhooks/{id}/{token}` request path, so a
   * value carrying `/`, `?`, or `#` (or a `.`/`..` segment) would
   * otherwise silently splice or retarget the request URL instead of
   * failing loudly here at construction.
   *
   * @throws {DiscordError} `CONFIG_INVALID_WEBHOOK_URL` when `webhookUrl`
   * is present but malformed, `CONFIG_INCOMPLETE_WEBHOOK` when
   * `webhookId`/`webhookToken` is present but empty,
   * `CONFIG_INVALID_WEBHOOK_ID` when `webhookId` isn't a Discord snowflake
   * ID, `CONFIG_INVALID_WEBHOOK_TOKEN` when `webhookToken` isn't a single
   * URL path segment, or `CONFIG_INVALID_BOT_TOKEN` when `botToken` is
   * present but empty.
   */
  protected override _processOption<K extends keyof DiscordInternalOptions>(
    key: K,
    value: DiscordInternalOptions[K],
  ): DiscordInternalOptions[K] {
    switch (key) {
      case 'webhookUrl': {
        if (value === undefined) break;
        const [err] = webhookUrlGuard.safeParse(value);
        if (err) {
          // Deliberately omit `value` (the webhook URL) from the thrown
          // error's context — the URL's path segment IS the webhook's
          // id+token credential, and `context` (like `.message`) is
          // commonly captured verbatim by loggers/error trackers.
          throw new DiscordError('CONFIG_INVALID_WEBHOOK_URL', {});
        }
        break;
      }
      case 'webhookId': {
        if (value === undefined) break;
        if (typeof value !== 'string' || value.trim() === '') {
          throw new DiscordError('CONFIG_INCOMPLETE_WEBHOOK', {});
        }
        const [err] = snowflakeGuard.safeParse(value);
        if (err) {
          // The id is not a secret (Discord surfaces webhook ids in channel
          // settings and message metadata), so echoing it is safe — unlike
          // `webhookToken` below, which is never echoed.
          throw new DiscordError('CONFIG_INVALID_WEBHOOK_ID', {
            webhookId: value,
          });
        }
        break;
      }
      case 'webhookToken': {
        if (value === undefined) break;
        if (typeof value !== 'string' || value.trim() === '') {
          throw new DiscordError('CONFIG_INCOMPLETE_WEBHOOK', {});
        }
        const [err] = webhookTokenGuard.safeParse(value);
        if (err) {
          // Deliberately omit the offending value from the error's context
          // — the token IS the webhook's credential (same reasoning as
          // CONFIG_INVALID_WEBHOOK_URL above).
          throw new DiscordError('CONFIG_INVALID_WEBHOOK_TOKEN', {});
        }
        break;
      }
      case 'botToken': {
        if (value === undefined) break;
        if (typeof value !== 'string' || value.trim() === '') {
          throw new DiscordError('CONFIG_INVALID_BOT_TOKEN', {});
        }
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Build the `/webhooks/{id}/{token}` request path from whichever webhook
   * config was supplied — `webhookId` + `webhookToken` directly, or parsed
   * out of `webhookUrl`.
   */
  private __webhookPath(): string {
    if (
      this.__hasNonEmptyOption('webhookId') &&
      this.__hasNonEmptyOption('webhookToken')
    ) {
      // `encodeURIComponent` is defense-in-depth on top of `_processOption`
      // (which already rejected `/`, `?`, and `#` in either value, so for
      // every accepted value this can never change which webhook is
      // addressed): it pins each raw configured value to exactly one path
      // segment. Note it does NOT encode `.`/`..` — that's why the
      // validation rejects dot segments explicitly rather than relying on
      // encoding.
      return `/webhooks/${
        encodeURIComponent(this._getOption('webhookId') as string)
      }/${encodeURIComponent(this._getOption('webhookToken') as string)}`;
    }
    // `_processOption` already validated `webhookUrl` against the same
    // pattern `parseWebhookUrl` uses, so a match is guaranteed here. The
    // captures are substrings of a URL — already in URL form, with `/`,
    // `?`, and `#` excluded by the pattern — so they're interpolated as-is
    // rather than re-encoded (which would double-encode any percent-escape
    // the pasted URL carries).
    const parsed = parseWebhookUrl(this._getOption('webhookUrl') as string);
    return `/webhooks/${parsed!.id}/${parsed!.token}`;
  }

  /** Throw {@link DiscordError} `MODE_MISMATCH` if not configured for `expected`. */
  private __assertMode(expected: 'webhook' | 'bot', method: string): void {
    if (this.mode !== expected) {
      throw new DiscordError('MODE_MISMATCH', {
        method,
        expected,
        actual: this.mode,
      });
    }
  }

  /**
   * Whether `key` was supplied with a meaningful (non-empty string) value.
   *
   * `Options.hasOption` (from `@tundralibs/utils`) only reports whether the
   * key is PRESENT in the internal store — which is true even when the
   * caller explicitly passed `undefined` for it (see `_processOption`'s
   * doc comment for why that's a realistic shape). `mode` and
   * `__webhookPath` need "was this credential actually configured",
   * so they go through this helper instead of `hasOption` directly.
   */
  private __hasNonEmptyOption(key: keyof DiscordInternalOptions): boolean {
    const value = this._getOption(key);
    return typeof value === 'string' && value.length > 0;
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link DiscordError} — so `DiscordError` stays the only thing a
   * public method throws for "the vendor responded, but the body doesn't
   * match what was expected." `B` is inferred from `guard`, so callers no
   * longer separately write out a `_makeRequest<B>()` type argument.
   *
   * By the time a method calls this, {@link _responseHandler} has already
   * run and thrown for any documented vendor error — this only has to
   * handle a response whose status looked fine but whose body doesn't
   * match what was expected.
   *
   * @template B - The expected response body type
   * @param endpoint - The endpoint to request
   * @param guard - Guardian schema object for validating the response
   * @returns The validated response data
   * @throws {DiscordError} `RESPONSE_ERROR` when the body fails validation
   *
   * @private
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
        throw new DiscordError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates Discord's
   * documented JSON error envelope (and rate-limit body) into a
   * {@link DiscordError}. Runs on every response (registered on
   * `_responseHandler` in the constructor): a `429` body is parsed as the
   * rate-limit shape; any other 4xx/5xx body is parsed as the standard
   * error envelope and its documented `code` mapped via
   * {@link VENDOR_ERROR_CODE_MAP}; an unparseable error body falls back to
   * the HTTP-status-based code. Does nothing for a successful response,
   * leaving body validation to {@link __parse}.
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {DiscordError} A vendor-mapped code, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE`, matching the vendor's
   * documented status/code pairs.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    if (status === 429) {
      const [, body] = RateLimitSchemaObject.safeParse(response.body);
      throw new DiscordError('RATE_LIMITED', {
        status,
        retryAfterSeconds: Discord.__retryAfterSeconds(response.headers),
        // `body` (and therefore `retry_after`) is `undefined` whenever the
        // 429 response doesn't match `RateLimitSchemaObject` (e.g. a
        // malformed/truncated proxy body) — fall back to a value that
        // still reads naturally against the RATE_LIMITED template's
        // literal trailing "s" (`${retryAfter}s` in `DiscordErrorCodes`),
        // e.g. "retry after a few seconds" rather than the literal
        // "${retryAfter}s". Deliberately singular ("second", not
        // "seconds") — the template's own trailing "s" completes it.
        retryAfter: body?.retry_after ?? 'a few second',
        global: body?.global,
      });
    }

    const [err, body] = ErrorSchemaObject.safeParse(response.body);
    if (body) {
      const mapped = VENDOR_ERROR_CODE_MAP[body.code];
      throw new DiscordError(mapped ?? this.__errorCodeForStatus(status), {
        status,
        vendorCode: body.code,
        vendorMessage: body.message,
        errors: body.errors,
      });
    }
    // Body missing or didn't match the documented error envelope — fall
    // back to SERVICE_UNAVAILABLE for 5xx (Discord's own outage pages
    // rarely follow the JSON contract), otherwise the status-mapped code
    // with the raw body attached for diagnostics.
    throw new DiscordError(
      status >= 500 ? 'SERVICE_UNAVAILABLE' : this.__errorCodeForStatus(status),
      {
        status,
        body: response.body,
        responseError: err?.toJSON(),
      },
    );
  }

  /** Map an HTTP status code to a stable, connect-specific error code. */
  private __errorCodeForStatus(status: number): DiscordErrorCode {
    switch (status) {
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      default:
        if (status >= 500) return 'SERVICE_UNAVAILABLE';
        return 'UNKNOWN_ERROR';
    }
  }
}
