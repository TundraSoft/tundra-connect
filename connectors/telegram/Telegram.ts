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
  botTokenGuard,
  type MessageSchema,
  MessageSchemaObject,
  ResponseEnvelopeSchemaObject,
  type SendMessageRequestSchema,
  SendMessageRequestSchemaObject,
  type UserSchema,
  UserSchemaObject,
} from './schema/mod.ts';
import { TelegramError, type TelegramErrorCode } from './errors/mod.ts';

/** Options for configuring a {@link Telegram} client. */
export type TelegramOptions = RESTlerOptions & {
  /**
   * Bot token issued by [@BotFather](https://t.me/BotFather), e.g.
   * `123456789:AAExampleTokenAABBCCDDEEFFGGHHIIJJKKLLMM`. Folded directly
   * into every request's URL path (`/bot{token}/{method}`) — see
   * {@link Telegram} for why this doesn't go through `auth: RESTlerAuth`.
   */
  botToken: string;
};

/**
 * Telegram client for the Telegram **Bot** HTTPS API.
 *
 * Deliberately scoped to the simple bot API only. Telegram also exposes
 * MTProto, a very different and much heavier binary protocol for building
 * full Telegram *client* applications — this connect does not implement
 * it and never will; every request here is a plain HTTPS call.
 *
 * Telegram authenticates by embedding the bot token directly in the
 * request path — `https://api.telegram.org/bot{token}/{method}` (note:
 * literally `bot` concatenated with the token, no separator) — not via a
 * header or query parameter. There is no `RESTlerAuth` shape for a
 * path-segment credential (similar to how a webhook URL doesn't fit that
 * model either), so this connect never sets `options.auth` and never
 * overrides `_authInjector`. Instead, `botToken` is validated up front and
 * folded into `baseURL` before `super()` runs (mirrors `AzureBlob`, whose
 * `baseURL` is likewise derived from an auth-adjacent option —
 * `auth.account` — pre-`super()`), so every endpoint method below can use
 * a plain relative path like `/sendMessage`. An explicit `baseURL` may
 * still be supplied to target a self-hosted Bot API server instead of
 * `api.telegram.org` — self-hosted servers use the identical
 * `/bot{token}/{method}` routing, so `baseURL` names only the server
 * origin and the constructor ALWAYS appends the `/bot{token}` segment to
 * it (normalizing away any trailing slash first, and skipping the append
 * when the supplied value already ends in `/bot{token}`). An override can
 * therefore change WHERE requests go, but can never strip the credential
 * segment out of the request path.
 *
 * Every method response arrives wrapped in Telegram's universal
 * `{ ok, result, error_code, description, parameters }` envelope (see
 * `ResponseEnvelopeSchemaObject`) — the constructor sets `_responseHandler`
 * once to unwrap it: `ok: false` throws a {@link TelegramError} mapped
 * primarily from the envelope's own `error_code` (falling back to the HTTP
 * status only when `error_code` is absent — the two don't always agree,
 * e.g. a `200` carrying `{ ok: false, error_code: 429, ... }`), `ok: true`
 * replaces `response.body` with `result` so each endpoint method validates
 * only its own payload shape.
 *
 * @example
 * ```typescript
 * import { Telegram } from '@tundraconnect/telegram';
 *
 * const client = new Telegram({ botToken: '123456789:AAExampleToken' });
 *
 * const me = await client.getMe();
 * console.log(me.username);
 *
 * const message = await client.sendMessage({
 *   chat_id: 123456789,
 *   text: '*Hello* from Telegram\\!',
 *   parse_mode: 'MarkdownV2',
 * });
 * console.log(message.message_id);
 * ```
 */
export class Telegram extends RESTler<TelegramOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Telegram';

  /** The configured bot token. */
  get botToken(): string {
    return this._getOption('botToken');
  }

  /**
   * Creates a new Telegram client instance.
   *
   * @param options - Configuration options for the client.
   * @param options.botToken - Bot token issued by @BotFather.
   * @param options.baseURL - Optional server origin override (e.g. a
   * self-hosted Bot API server such as `http://localhost:8081`). The
   * `/bot{token}` segment is always appended to it — see the class docs.
   * @throws {TelegramError} `CONFIG_INVALID_BOT_TOKEN` if `botToken` is
   * missing, blank, not a string, or doesn't match the documented
   * `<bot id>:<secret>` shape (see {@link botTokenGuard}) — the full shape
   * check happens in {@link _processOption}, which runs synchronously
   * during `super()` below, so a malformed token never reaches a live
   * client.
   */
  constructor(options: EventOptionKeys<TelegramOptions, RESTlerEvents>) {
    // `baseURL` is derived from `botToken`, so it must be read off the raw
    // constructor argument here — before `super()` — rather than through
    // `_processOption`, which only runs once `super()` has started
    // building the option store (mirrors AzureBlob, whose `baseURL` is
    // similarly derived from `auth.account` pre-`super()`).
    const botToken = typeof options?.botToken === 'string'
      ? options.botToken.trim()
      : '';
    if (!botToken) {
      throw new TelegramError('CONFIG_INVALID_BOT_TOKEN', {
        botToken: options?.botToken,
      });
    }
    // An explicit `baseURL` names only the SERVER to target (a self-hosted
    // Bot API server routes with the identical `/bot{token}/{method}` shape)
    // — the credential segment stays this connect's job. Without this
    // fold-in, RESTler's option merge would let a caller-supplied `baseURL`
    // replace the token-bearing default wholesale, sending every request
    // tokenless (a misleading NOT_FOUND on every call). Normalized on a
    // shallow copy (never mutating the caller's object): trailing slashes
    // are stripped, and a value already ending in the configured
    // `/bot{token}` segment is left alone (no double-append). RESTler's own
    // `_processOption('baseURL')` still validates the transformed value
    // when `super()` routes options through it.
    if (typeof options.baseURL === 'string' && options.baseURL.length > 0) {
      const origin = options.baseURL.replace(/\/+$/, '');
      options = {
        ...options,
        baseURL: origin.endsWith(`/bot${botToken}`)
          ? origin
          : `${origin}/bot${botToken}`,
      };
    }
    super(options, {
      baseURL: `https://api.telegram.org/bot${botToken}`,
      timeout: 30,
      contentType: 'JSON',
    });
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Send a text message via `POST /sendMessage`.
   *
   * `options` is validated against {@link SendMessageRequestSchema} before
   * anything is sent.
   *
   * @param options - Message options; see {@link SendMessageRequestSchema}.
   * @returns Promise resolving to the sent {@link MessageSchema}.
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` if `options` fails
   * local validation, or `BAD_REQUEST`, `AUTH_FAILED`, `FORBIDDEN`,
   * `NOT_FOUND`, `RATE_LIMITED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`,
   * or `UNKNOWN_ERROR` for a vendor-rejected or malformed response.
   *
   * @example
   * ```typescript
   * const message = await client.sendMessage({
   *   chat_id: '@examplechannel',
   *   text: 'Deployment finished successfully.',
   *   disable_notification: true,
   * });
   * console.log(message.message_id);
   * ```
   */
  public async sendMessage(
    options: SendMessageRequestSchema,
  ): Promise<MessageSchema> {
    const [error, payload] = SendMessageRequestSchemaObject.safeParse(
      options,
    );
    if (error || !payload) {
      throw new TelegramError('REQUEST_VALIDATION_ERROR', {
        reason: error?.message ?? 'validation failed',
        responseError: (error as GuardianError | null)?.toJSON(),
      });
    }

    return await this.__requestAndValidate(
      {
        path: '/sendMessage',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      MessageSchemaObject,
    );
  }

  /**
   * Fetch the bot's own identity via `GET /getMe`.
   *
   * Takes no parameters — a simple way to confirm a configured bot token
   * is live and see what the bot is permitted to do.
   *
   * @returns Promise resolving to the bot's {@link UserSchema}.
   * @throws {TelegramError} `AUTH_FAILED`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const me = await client.getMe();
   * console.log(me.username, me.can_join_groups);
   * ```
   */
  public getMe(): Promise<UserSchema> {
    return this.__requestAndValidate(
      { path: '/getMe', method: 'GET' },
      UserSchemaObject,
    );
  }

  /**
   * Processes and validates configuration options specific to the
   * Telegram client before passing them to the parent class.
   *
   * `botToken` is validated against {@link botTokenGuard} — reusing the
   * schema exported for advanced usage (`@tundraconnect/telegram/schemas`)
   * so the config-time check and that schema share one pattern definition
   * rather than drifting apart — instead of just checking it's a
   * non-empty string (mirrors how `discord/Discord.ts` validates
   * `webhookUrl` against `webhookUrlGuard`, and `stripe/Stripe.ts`
   * validates `secretKey` against `secretKeyGuard`). Catching a malformed
   * token here means the constructor throws before it's ever folded into
   * `baseURL`, rather than surfacing later as a misleading `NOT_FOUND`
   * from Telegram's routing layer.
   *
   * @throws {TelegramError} `CONFIG_INVALID_BOT_TOKEN` when `botToken` is
   * present but not a non-empty string matching `<bot id>:<secret>`.
   */
  protected override _processOption<K extends keyof TelegramOptions>(
    key: K,
    value: TelegramOptions[K],
  ): TelegramOptions[K] {
    switch (key) {
      case 'botToken': {
        const trimmed = typeof value === 'string' ? value.trim() : value;
        const [err] = botTokenGuard.safeParse(trimmed);
        if (err) {
          throw new TelegramError('CONFIG_INVALID_BOT_TOKEN', {
            botToken: value,
          });
        }
        value = trimmed as TelegramOptions[K];
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link TelegramError} — so `TelegramError` stays the only thing
   * a public method throws for "the vendor responded, but the body doesn't
   * match what was expected." `B` is inferred from `guard`, so callers no
   * longer separately write out a `_makeRequest<B>()` type argument.
   *
   * By the time a method calls this, {@link _responseHandler} has already
   * unwrapped Telegram's envelope and thrown for `ok: false` — this only
   * has to handle a `result` whose shape doesn't match what was expected.
   *
   * @template B - The expected response body type.
   * @param endpoint - The endpoint to request.
   * @param guard - Guardian schema object for validating the response.
   * @returns The validated response data.
   * @throws {TelegramError} `RESPONSE_ERROR` when the body fails validation.
   *
   * @private
   */
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
        throw new TelegramError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — unwraps Telegram's
   * universal `{ ok, result, error_code, description, parameters }`
   * envelope. Runs on every response (registered on `_responseHandler` in
   * the constructor): a body that doesn't even match the envelope shape
   * throws `RESPONSE_ERROR` (or `SERVICE_UNAVAILABLE` for a 5xx whose body
   * isn't Telegram's JSON at all, e.g. a proxy error page); `ok: false`
   * throws a status/`error_code`-mapped {@link TelegramError}; `ok: true`
   * replaces `response.body` with `result`, leaving endpoint-specific
   * validation to {@link __parse}.
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {TelegramError} `BAD_REQUEST`, `AUTH_FAILED`, `FORBIDDEN`,
   * `NOT_FOUND`, `RATE_LIMITED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`,
   * or `UNKNOWN_ERROR`, matching the vendor's documented status/`error_code`
   * pairs.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const [envelopeErr, envelope] = ResponseEnvelopeSchemaObject.safeParse(
      response.body,
    );
    if (envelopeErr || !envelope) {
      const status = response.status;
      if (status !== null && status >= 500) {
        throw new TelegramError('SERVICE_UNAVAILABLE', {
          status,
          body: response.body,
        });
      }
      throw new TelegramError('RESPONSE_ERROR', {
        status: status ?? undefined,
        body: response.body,
        responseError: envelopeErr?.toJSON(),
      });
    }

    if (envelope.ok) {
      // Telegram wraps every successful call's payload in `result` —
      // unwrap it here so each endpoint method's own `__parse` validates
      // against its own response schema instead of this generic envelope.
      return envelope.result;
    }

    throw new TelegramError(
      this.__errorCodeFor(response.status, envelope.error_code),
      {
        status: response.status ?? undefined,
        errorCode: envelope.error_code,
        // Both `description` and `parameters.retry_after` are optional in
        // Telegram's envelope (see `ResponseEnvelopeSchema`/
        // `ResponseParametersSchema` in `schema/Error.ts`) — fall back to a
        // value that keeps the BAD_REQUEST/AUTH_FAILED/FORBIDDEN/NOT_FOUND/
        // RATE_LIMITED templates in `TelegramErrorCodes` grammatical
        // instead of rendering the literal `${description}`/`${retryAfter}`
        // placeholder when the vendor omits them.
        description: envelope.description ?? 'no further details provided',
        retryAfter: envelope.parameters?.retry_after ?? 'a few',
        migrateToChatId: envelope.parameters?.migrate_to_chat_id,
      },
    );
  }

  /**
   * Map an `ok: false` response to a stable, connect-specific error code.
   *
   * Only ever called from {@link __toError}'s `ok: false` branch, i.e. once
   * a Telegram error envelope has already been parsed — so `errorCode`
   * (Telegram's own `error_code`, echoed from the envelope body) is the
   * more specific signal and takes priority, falling back to the HTTP
   * `status` only when the envelope didn't carry an `error_code`. This
   * matters because Telegram (or an intermediating proxy) doesn't always
   * make the two agree: a `200` response can still carry
   * `{ ok: false, error_code: 429, ... }`, and mapping off `status` there
   * would silently swallow a rate-limit as `UNKNOWN_ERROR` even though the
   * envelope is explicit about what happened. `status` stays the primary
   * signal for a pure-HTTP failure with no parseable envelope at all — that
   * case is handled earlier in {@link __toError} and never reaches here.
   */
  private __errorCodeFor(
    status: number | null,
    errorCode?: number,
  ): TelegramErrorCode {
    switch (errorCode ?? status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'AUTH_FAILED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 429:
        return 'RATE_LIMITED';
      default:
        if ((errorCode ?? status ?? 0) >= 500) return 'SERVICE_UNAVAILABLE';
        return 'UNKNOWN_ERROR';
    }
  }
}
