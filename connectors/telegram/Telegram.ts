import {
  type ResponseBody,
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerRateLimitError,
  RESTlerRequestError,
  type RESTlerRequestOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
  RESTlerTimeoutError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, GuardianError } from '@guardian';
import { constantTimeEqual } from '@crypt';
import {
  type AnswerCallbackQueryRequestSchema,
  AnswerCallbackQueryRequestSchemaObject,
  BotCommandListSchemaObject,
  type BotCommandSchema,
  botTokenGuard,
  type DeleteMessageRequestSchema,
  DeleteMessageRequestSchemaObject,
  type DeleteMyCommandsRequestSchema,
  DeleteMyCommandsRequestSchemaObject,
  type DeleteWebhookRequestSchema,
  DeleteWebhookRequestSchemaObject,
  type EditMessageReplyMarkupRequestSchema,
  EditMessageReplyMarkupRequestSchemaObject,
  type EditMessageResultSchema,
  EditMessageResultSchemaObject,
  type EditMessageTextRequestSchema,
  EditMessageTextRequestSchemaObject,
  type GetMyCommandsRequestSchema,
  GetMyCommandsRequestSchemaObject,
  type MessageEntitySchema,
  type MessageSchema,
  MessageSchemaObject,
  ResponseEnvelopeSchemaObject,
  type SendMessageRequestSchema,
  SendMessageRequestSchemaObject,
  type SetMyCommandsRequestSchema,
  SetMyCommandsRequestSchemaObject,
  type SetWebhookRequestSchema,
  SetWebhookRequestSchemaObject,
  TrueResultSchemaObject,
  UPDATE_TYPES,
  type UpdateSchema,
  UpdateSchemaObject,
  type UpdateType,
  type UserSchema,
  UserSchemaObject,
  WEBHOOK_SECRET_TOKEN_PATTERN,
  type WebhookInfoSchema,
  WebhookInfoSchemaObject,
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
 * The bot token as it appears in a request URL (`/bot<id>:<secret>`), for
 * scrubbing it out of RESTler's errors (see `Telegram.__scrubToken`).
 */
const BOT_TOKEN_IN_PATH: RegExp = /\/bot\d+:[A-Za-z0-9_-]+/g;

/** The header Telegram puts the webhook's `secret_token` in. */
export const WEBHOOK_SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';

/**
 * A `/command` token, optionally addressed to a bot: `/status`,
 * `/status@BrevilyBot`. Bot command and bot username characters are both
 * `A-Z a-z 0-9 _`.
 */
const COMMAND_TOKEN: RegExp = /^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?$/;

/**
 * Anything a runtime hands you as request headers — a `Headers` instance
 * (Cloudflare Workers, Deno, Bun, Node's `fetch`) or a plain object
 * (Node's `IncomingMessage.headers`). Lookup is case-insensitive either
 * way, as HTTP header names are.
 */
export type TelegramWebhookHeaders =
  | Headers
  | Record<string, string | string[] | undefined>;

/** Arguments to {@link Telegram.verifyWebhookRequest}. */
export type VerifyWebhookRequestOptions = {
  /** The webhook request's headers. */
  headers: TelegramWebhookHeaders;
  /** The RAW request body, exactly as received (`await request.text()`). */
  body: string;
  /** The `secret_token` the webhook was registered with via `setWebhook`. */
  secretToken: string;
};

/** The message fields {@link Telegram.parseCommand} reads. */
export type CommandSource = Pick<MessageSchema, 'text' | 'entities'>;

/** A `/command` parsed out of a message by {@link Telegram.parseCommand}. */
export type ParsedCommand = {
  /** Command name, lowercased, without the `/` or `@BotName`: `'status'`. */
  command: string;
  /** Everything after the command, split on whitespace; `[]` when none. */
  args: string[];
  /** Everything after the command, trimmed but otherwise unsplit; `''` when none. */
  rawArgs: string;
  /**
   * The bot the command was addressed to (`/status@BrevilyBot` →
   * `'BrevilyBot'`), as written; absent for a bare `/status`.
   */
  botUsername?: string;
};

/** {@link Telegram.updateKind}'s result: a documented kind, or `'unknown'`. */
export type UpdateKind = UpdateType | 'unknown';

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
 * Updates arrive over a webhook: register it with
 * {@link Telegram.setWebhook}, then authenticate and parse each delivery
 * with the static {@link Telegram.verifyWebhookRequest}.
 * {@link Telegram.updateKind} and {@link Telegram.parseCommand} help route
 * it. Long polling (`getUpdates`) is not implemented.
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
      // Deliberately NOT echoing the supplied token into the error context:
      // this is logged, and "invalid" includes a real token with a stray
      // newline from an env file. The message already says what shape is
      // expected.
      throw new TelegramError('CONFIG_INVALID_BOT_TOKEN', {});
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
      let origin = options.baseURL;
      // A loop, not `/\/+$/`: that regex backtracks polynomially on a long
      // run of slashes followed by another character.
      while (origin.endsWith('/')) origin = origin.slice(0, -1);
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
   * anything is sent: `text` must be 1-4096 characters (counted as UTF-16
   * code units before entity parsing — see `MESSAGE_TEXT_MAX_LENGTH`),
   * every inline keyboard button needs exactly one action, and
   * `callback_data` must be 1-64 bytes of UTF-8.
   *
   * @param options - Message options; see {@link SendMessageRequestSchema}.
   * @returns Promise resolving to the sent {@link MessageSchema}.
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` if `options` fails
   * local validation, or `BAD_REQUEST`, `AUTH_FAILED`, `FORBIDDEN`,
   * `NOT_FOUND`, `RATE_LIMITED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`,
   * `TIMEOUT`, `NETWORK_ERROR` or `UNKNOWN_ERROR` for a vendor-rejected,
   * failed or malformed response.
   *
   * @example
   * ```typescript
   * const message = await client.sendMessage({
   *   chat_id: -1001234567890,
   *   text: '<b>Payout due</b> for 3 partners today.',
   *   parse_mode: 'HTML',
   *   disable_notification: true,
   *   link_preview_options: { is_disabled: true },
   *   reply_markup: {
   *     inline_keyboard: [[
   *       { text: 'Open payouts', url: 'https://example.com/payouts' },
   *       { text: 'Snooze 1d', callback_data: 'snooze:payouts:1d' },
   *     ]],
   *   },
   * });
   * console.log(message.message_id);
   * ```
   */
  public async sendMessage(
    options: SendMessageRequestSchema,
  ): Promise<MessageSchema> {
    return await this.__send(
      '/sendMessage',
      SendMessageRequestSchemaObject,
      options,
      MessageSchemaObject,
    );
  }

  /**
   * Edit the text (and optionally the inline keyboard) of a message via
   * `POST /editMessageText`.
   *
   * Target either a message the bot sent to a chat (`chat_id` +
   * `message_id`) or an inline-mode message (`inline_message_id`), not
   * both. `text` follows the same limit as {@link Telegram.sendMessage}.
   * Leaving out `reply_markup` removes the message's inline keyboard
   * (Telegram's observed behaviour; the Bot API reference does not say so
   * for this method).
   *
   * @param options - Edit options; see {@link EditMessageTextRequestSchema}.
   * @returns Promise resolving to the edited {@link MessageSchema}, or
   * `true` when an inline message was edited (Telegram returns no message
   * for those).
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` if `options` fails
   * local validation, or `BAD_REQUEST` (including Telegram's "message is
   * not modified" when the new text and markup equal the old), `FORBIDDEN`,
   * `RATE_LIMITED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, `TIMEOUT`,
   * `NETWORK_ERROR` or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const edited = await client.editMessageText({
   *   chat_id: -1001234567890,
   *   message_id: 42,
   *   text: 'Abuse report #17: resolved by @ada',
   * });
   * if (edited !== true) console.log(edited.edit_date);
   * ```
   */
  public async editMessageText(
    options: EditMessageTextRequestSchema,
  ): Promise<EditMessageResultSchema> {
    return await this.__send(
      '/editMessageText',
      EditMessageTextRequestSchemaObject,
      options,
      EditMessageResultSchemaObject,
    );
  }

  /**
   * Replace or remove a message's inline keyboard via
   * `POST /editMessageReplyMarkup`, leaving its text alone.
   *
   * @param options - Target message and the new `reply_markup` (omit it to
   * remove the keyboard); see {@link EditMessageReplyMarkupRequestSchema}.
   * @returns Promise resolving to the edited {@link MessageSchema}, or
   * `true` when an inline message was edited.
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` if `options` fails
   * local validation, or `BAD_REQUEST`, `FORBIDDEN`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * // Drop the buttons once the alert has been acknowledged.
   * await client.editMessageReplyMarkup({
   *   chat_id: -1001234567890,
   *   message_id: 42,
   * });
   * ```
   */
  public async editMessageReplyMarkup(
    options: EditMessageReplyMarkupRequestSchema,
  ): Promise<EditMessageResultSchema> {
    return await this.__send(
      '/editMessageReplyMarkup',
      EditMessageReplyMarkupRequestSchemaObject,
      options,
      EditMessageResultSchemaObject,
    );
  }

  /**
   * Answer a callback query via `POST /answerCallbackQuery`.
   *
   * Call this for every callback query, even with no `text`: the user's
   * client shows a progress indicator on the button until you do.
   *
   * @param options - `callback_query_id` plus optional notification `text`
   * (0-200 characters), `show_alert`, `url` and `cache_time`; see
   * {@link AnswerCallbackQueryRequestSchema}.
   * @returns Promise resolving to `true`.
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` if `options` fails
   * local validation, or `BAD_REQUEST` (e.g. the query is too old to
   * answer), `RATE_LIMITED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`,
   * `TIMEOUT`, `NETWORK_ERROR` or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * await client.answerCallbackQuery({
   *   callback_query_id: '4382bfdwdsb323b2d9',
   *   text: 'Muted Sales alerts for 1 hour',
   * });
   * ```
   */
  public async answerCallbackQuery(
    options: AnswerCallbackQueryRequestSchema,
  ): Promise<true> {
    return await this.__send(
      '/answerCallbackQuery',
      AnswerCallbackQueryRequestSchemaObject,
      options,
      TrueResultSchemaObject,
    );
  }

  /**
   * Delete a message via `POST /deleteMessage`.
   *
   * Telegram refuses (`BAD_REQUEST`) to delete a message older than 48
   * hours, and in groups and channels the bot needs the matching
   * administrator rights.
   *
   * @param options - `chat_id` and `message_id`; see
   * {@link DeleteMessageRequestSchema}.
   * @returns Promise resolving to `true`.
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` if `options` fails
   * local validation, or `BAD_REQUEST`, `FORBIDDEN`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * await client.deleteMessage({ chat_id: -1001234567890, message_id: 42 });
   * ```
   */
  public async deleteMessage(
    options: DeleteMessageRequestSchema,
  ): Promise<true> {
    return await this.__send(
      '/deleteMessage',
      DeleteMessageRequestSchemaObject,
      options,
      TrueResultSchemaObject,
    );
  }

  /**
   * Register the bot's webhook via `POST /setWebhook`.
   *
   * From then on Telegram POSTs every {@link UpdateSchema} to `url` with
   * `secret_token` in the `X-Telegram-Bot-Api-Secret-Token` header; check
   * it with {@link Telegram.verifyWebhookRequest}. `secret_token` is
   * required here (Telegram treats it as optional) so every webhook this
   * package sets up can be verified. `url` must be `https:` on port 443,
   * 80, 88 or 8443, and `max_connections` 1-100. Telegram retries a
   * delivery the webhook answers with a non-2xx status.
   *
   * @param options - Webhook settings; see {@link SetWebhookRequestSchema}.
   * @returns Promise resolving to `true`.
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` if `options` fails
   * local validation (the error never repeats the secret), or
   * `BAD_REQUEST` (e.g. Telegram could not resolve or reach the host),
   * `AUTH_FAILED`, `RATE_LIMITED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`,
   * `TIMEOUT`, `NETWORK_ERROR` or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * await client.setWebhook({
   *   url: 'https://bot.example.com/telegram',
   *   secret_token: 'a-long-random-value-from-your-secret-store',
   *   allowed_updates: ['message', 'callback_query', 'my_chat_member'],
   * });
   * ```
   */
  public async setWebhook(options: SetWebhookRequestSchema): Promise<true> {
    return await this.__send(
      '/setWebhook',
      SetWebhookRequestSchemaObject,
      options,
      TrueResultSchemaObject,
    );
  }

  /**
   * Remove the bot's webhook via `POST /deleteWebhook`.
   *
   * @param options - Pass `{ drop_pending_updates: true }` to also discard
   * updates still waiting to be delivered.
   * @returns Promise resolving to `true`.
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` if `options` fails
   * local validation, or `AUTH_FAILED`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * await client.deleteWebhook({ drop_pending_updates: true });
   * ```
   */
  public async deleteWebhook(
    options: DeleteWebhookRequestSchema = {},
  ): Promise<true> {
    return await this.__send(
      '/deleteWebhook',
      DeleteWebhookRequestSchemaObject,
      options,
      TrueResultSchemaObject,
    );
  }

  /**
   * Read the webhook's current status via `GET /getWebhookInfo`.
   *
   * `url` is empty when no webhook is set. `pending_update_count`,
   * `last_error_date` and `last_error_message` are the first things to
   * check when updates stop arriving.
   *
   * @returns Promise resolving to the {@link WebhookInfoSchema}.
   * @throws {TelegramError} `AUTH_FAILED`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const info = await client.getWebhookInfo();
   * if (info.last_error_message) console.warn(info.last_error_message);
   * ```
   */
  public getWebhookInfo(): Promise<WebhookInfoSchema> {
    return this.__requestAndValidate(
      { path: '/getWebhookInfo', method: 'GET' },
      WebhookInfoSchemaObject,
    );
  }

  /**
   * Set the bot's command menu via `POST /setMyCommands`.
   *
   * @param options - Up to 100 commands (`command`: 1-32 of `a-z`, `0-9`,
   * `_`, without the `/`; `description`: 1-256 characters), an optional
   * `scope` and `language_code`; see {@link SetMyCommandsRequestSchema}.
   * @returns Promise resolving to `true`.
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` if `options` fails
   * local validation, or `BAD_REQUEST`, `AUTH_FAILED`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * await client.setMyCommands({
   *   commands: [
   *     { command: 'status', description: 'Service status' },
   *     { command: 'today', description: "Today's totals" },
   *   ],
   *   scope: { type: 'all_private_chats' },
   * });
   * ```
   */
  public async setMyCommands(
    options: SetMyCommandsRequestSchema,
  ): Promise<true> {
    return await this.__send(
      '/setMyCommands',
      SetMyCommandsRequestSchemaObject,
      options,
      TrueResultSchemaObject,
    );
  }

  /**
   * Read the bot's command menu for a scope and language via
   * `POST /getMyCommands`.
   *
   * @param options - Optional `scope` and `language_code`; see
   * {@link GetMyCommandsRequestSchema}.
   * @returns Promise resolving to the commands; `[]` when none are set.
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` if `options` fails
   * local validation, or `BAD_REQUEST`, `AUTH_FAILED`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const commands = await client.getMyCommands({
   *   scope: { type: 'all_private_chats' },
   * });
   * console.log(commands.map((c) => c.command));
   * ```
   */
  public async getMyCommands(
    options: GetMyCommandsRequestSchema = {},
  ): Promise<BotCommandSchema[]> {
    return await this.__send(
      '/getMyCommands',
      GetMyCommandsRequestSchemaObject,
      options,
      BotCommandListSchemaObject,
    );
  }

  /**
   * Delete the bot's command menu for a scope and language via
   * `POST /deleteMyCommands`. Users in that scope then see the next
   * broader scope's commands.
   *
   * @param options - Optional `scope` and `language_code`; see
   * {@link DeleteMyCommandsRequestSchema}.
   * @returns Promise resolving to `true`.
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` if `options` fails
   * local validation, or `BAD_REQUEST`, `AUTH_FAILED`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * await client.deleteMyCommands({ scope: { type: 'all_group_chats' } });
   * ```
   */
  public async deleteMyCommands(
    options: DeleteMyCommandsRequestSchema = {},
  ): Promise<true> {
    return await this.__send(
      '/deleteMyCommands',
      DeleteMyCommandsRequestSchemaObject,
      options,
      TrueResultSchemaObject,
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
   * `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or `UNKNOWN_ERROR`.
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
   * Authenticate a webhook request and parse its body into an
   * {@link UpdateSchema}.
   *
   * Checks run in this order, and the body is not parsed until the secret
   * has matched:
   *
   * 1. `secretToken` must be a valid `secret_token` (1-256 characters of
   *    `A-Z a-z 0-9 _ -`); otherwise `CONFIG_INVALID_WEBHOOK_SECRET`.
   *    This also stops an unset secret (an empty string from a missing
   *    environment variable) from matching a request with no header.
   * 2. The `X-Telegram-Bot-Api-Secret-Token` header must be present
   *    (`WEBHOOK_SECRET_MISSING`) and equal `secretToken`, compared in
   *    constant time with `@tundralibs/crypt`'s `constantTimeEqual`
   *    (`WEBHOOK_SECRET_INVALID`). A header longer than 256 characters is
   *    refused without comparing, since no valid secret is that long.
   * 3. `body` must be JSON (`WEBHOOK_MALFORMED_BODY`) and match
   *    {@link UpdateSchemaObject} (`WEBHOOK_INVALID_UPDATE`). Unknown
   *    update kinds and unknown fields are accepted.
   *
   * Neither the configured secret nor the received header value ever
   * appears in an error's message or context. Static, so it needs no bot
   * token: the secret is all that is checked.
   *
   * Answer a secret failure with `401` and a body failure with a `2xx`
   * after logging it: Telegram redelivers on any non-2xx status, and a
   * body that failed to parse once will fail again.
   *
   * @param options - Request `headers` (a `Headers` instance or a plain
   * object), the raw `body` string, and the configured `secretToken`.
   * @returns The parsed {@link UpdateSchema}.
   * @throws {TelegramError} `CONFIG_INVALID_WEBHOOK_SECRET`,
   * `WEBHOOK_SECRET_MISSING`, `WEBHOOK_SECRET_INVALID`,
   * `WEBHOOK_MALFORMED_BODY` or `WEBHOOK_INVALID_UPDATE`.
   *
   * @example
   * ```typescript
   * declare const request: Request;
   * declare const env: { TELEGRAM_WEBHOOK_SECRET: string };
   *
   * const update = Telegram.verifyWebhookRequest({
   *   headers: request.headers,
   *   body: await request.text(), // text(), never json()
   *   secretToken: env.TELEGRAM_WEBHOOK_SECRET,
   * });
   * console.log(Telegram.updateKind(update));
   * ```
   */
  public static verifyWebhookRequest(
    options: VerifyWebhookRequestOptions,
  ): UpdateSchema {
    const { headers, body, secretToken } = options;
    if (
      typeof secretToken !== 'string' ||
      !WEBHOOK_SECRET_TOKEN_PATTERN.test(secretToken)
    ) {
      // Never echo the configured value — it is (meant to be) a secret.
      throw new TelegramError('CONFIG_INVALID_WEBHOOK_SECRET', {});
    }
    const received = Telegram.__header(headers, WEBHOOK_SECRET_HEADER);
    if (!received) {
      throw new TelegramError('WEBHOOK_SECRET_MISSING', {});
    }
    // No valid secret exceeds 256 characters, so a longer header cannot
    // match; refusing it first reveals nothing about the secret and keeps
    // an oversized header from buying a long comparison.
    if (received.length > 256 || !constantTimeEqual(received, secretToken)) {
      throw new TelegramError('WEBHOOK_SECRET_INVALID', {});
    }

    let parsed: unknown;
    try {
      if (typeof body !== 'string') throw new TypeError('body is not a string');
      parsed = JSON.parse(body);
    } catch (cause) {
      throw new TelegramError(
        'WEBHOOK_MALFORMED_BODY',
        {},
        cause instanceof Error ? cause : undefined,
      );
    }
    const [error, update] = UpdateSchemaObject.safeParse(parsed);
    if (error || !update) {
      throw new TelegramError(
        'WEBHOOK_INVALID_UPDATE',
        {
          reason: error?.message ?? 'validation failed',
          responseError: (error as GuardianError | null)?.toJSON(),
        },
        error ?? undefined,
      );
    }
    return update;
  }

  /**
   * Which kind of update this is: the first documented update field (see
   * `UPDATE_TYPES`) that is set, or `'unknown'` for a kind Telegram added
   * after this package was published.
   *
   * @param update - A parsed {@link UpdateSchema}.
   * @returns The update kind, e.g. `'message'` or `'callback_query'`.
   *
   * @example
   * ```typescript
   * declare const update: UpdateSchema;
   *
   * switch (Telegram.updateKind(update)) {
   *   case 'message':
   *     console.log(update.message?.text);
   *     break;
   *   case 'callback_query':
   *     console.log(update.callback_query?.data);
   *     break;
   * }
   * ```
   */
  public static updateKind(update: UpdateSchema): UpdateKind {
    const fields = update as unknown as Record<string, unknown>;
    return UPDATE_TYPES.find((kind) => fields[kind] !== undefined) ??
      'unknown';
  }

  /**
   * Parse a `/command` out of a message (or its text).
   *
   * Pure: no request is made. Returns `null` when the text is not a
   * command, or when the command is addressed to a DIFFERENT bot
   * (`/status@OtherBot` when `botUsername` is `'BrevilyBot'`). Bot names
   * are compared case-insensitively; `botUsername` may carry a leading
   * `@`. Without `botUsername`, a command addressed to any bot is
   * returned, with the addressee in `botUsername`.
   *
   * When given a message whose `entities` array is present, the entities
   * decide: the command is the `bot_command` entity at offset 0, and a
   * message with no such entity is not a command. Otherwise the text is
   * parsed: a `/` followed by letters, digits and underscores, optionally
   * `@BotName`, then whitespace or the end of the text (`/status-x` is not
   * a command).
   *
   * The command is lowercased (`/Status` → `'status'`), since users may
   * type it in any case but `setMyCommands` only allows lowercase. `args`
   * is the rest of the text split on whitespace; `rawArgs` is the same
   * text trimmed but unsplit, for arguments that may contain spaces.
   *
   * @param message - A message (anything with `text` and optionally
   * `entities`) or a plain string.
   * @param botUsername - This bot's username, e.g. from `getMe()`.
   * @returns The {@link ParsedCommand}, or `null`.
   *
   * @example
   * ```typescript
   * Telegram.parseCommand('/org@BrevilyBot  acme  corp', 'brevilybot');
   * // { command: 'org', args: ['acme', 'corp'], rawArgs: 'acme  corp', botUsername: 'BrevilyBot' }
   *
   * Telegram.parseCommand('/org@OtherBot acme', 'BrevilyBot'); // null
   * ```
   */
  public static parseCommand(
    message: string | CommandSource,
    botUsername?: string,
  ): ParsedCommand | null {
    const text = typeof message === 'string' ? message : message?.text;
    if (typeof text !== 'string' || !text.startsWith('/')) return null;

    let token: string;
    const entities: MessageEntitySchema[] | undefined =
      typeof message === 'string' ? undefined : message.entities;
    if (entities !== undefined) {
      const entity = entities.find((e) =>
        e.type === 'bot_command' && e.offset === 0
      );
      if (!entity) return null;
      // Entity offsets/lengths are UTF-16 code units, as `slice` is.
      token = text.slice(0, entity.length);
    } else {
      token = /^\S+/.exec(text)?.[0] ?? '';
    }

    const match = COMMAND_TOKEN.exec(token);
    if (!match) return null;
    const [, name = '', addressee] = match;
    if (
      addressee !== undefined && botUsername !== undefined &&
      addressee.toLowerCase() !==
        botUsername.replace(/^@/, '').toLowerCase()
    ) {
      return null;
    }

    const rawArgs = text.slice(token.length).trim();
    const parsed: ParsedCommand = {
      command: name.toLowerCase(),
      args: rawArgs === '' ? [] : rawArgs.split(/\s+/),
      rawArgs,
    };
    if (addressee !== undefined) parsed.botUsername = addressee;
    return parsed;
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
          // Never echo the credential — see the constructor's identical guard.
          throw new TelegramError('CONFIG_INVALID_BOT_TOKEN', {});
        }
        value = trimmed as TelegramOptions[K];
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Every request funnels through here, so a transport failure surfaces as
   * this connect's own error on every path: a timeout as `TIMEOUT`, a
   * failure before any response as `NETWORK_ERROR`, and an exhausted
   * RESTler rate-limit retry (`maxRetryWait`) as `RATE_LIMITED` — all
   * `transient`. A {@link TelegramError} from the response handler passes
   * through unchanged.
   *
   * The bot token lives in the URL path, which RESTler's own redaction
   * (query string and userinfo only) does not cover: the failed request's
   * `context.request.url`, and on some runtimes the `fetch` error's message,
   * still carry `/bot<token>/`. Every error is therefore run through
   * {@link Telegram.__scrubToken} before it is wrapped or re-thrown, so the
   * token never reaches a serialised `cause`.
   */
  protected override async _makeRequest<H = ResponseBody, B = H>(
    endpoint: RESTlerEndpoint,
    options: RESTlerRequestOptions<H, B> = {},
  ): Promise<RESTlerResponse<B>> {
    try {
      return await super._makeRequest<H, B>(endpoint, options);
    } catch (err) {
      throw this.__transportError(Telegram.__scrubToken(err), endpoint.timeout);
    }
  }

  /**
   * Replaces every `/bot<id>:<secret>` in `err`'s cause chain — each
   * error's `message`, `stack` and `context.request.url` — with
   * `/bot[REDACTED]`, in place, so each error keeps its type and identity.
   * Cycle- and depth-guarded; a field that can't be rewritten is skipped,
   * since redaction must never itself break error handling.
   */
  private static __scrubToken(err: unknown): unknown {
    const scrub = (value: unknown): unknown =>
      typeof value === 'string'
        ? value.replace(BOT_TOKEN_IN_PATH, '/bot[REDACTED]')
        : value;
    const rewrite = (obj: Record<string, unknown>, key: string): void => {
      try {
        const value = obj[key];
        const safe = scrub(value);
        if (safe === value) return;
        obj[key] = safe;
        if (obj[key] !== safe) {
          Object.defineProperty(obj, key, { value: safe, configurable: true });
        }
      } catch {
        // Read-only and non-configurable: nothing more can be done.
      }
    };
    const seen = new Set<unknown>();
    let node: unknown = err;
    for (let depth = 0; node && depth < 16; depth++) {
      if (typeof node !== 'object' || seen.has(node)) break;
      seen.add(node);
      const obj = node as Record<string, unknown>;
      rewrite(obj, 'message');
      rewrite(obj, '_baseMessage');
      rewrite(obj, 'stack');
      const request = (obj.context as { request?: unknown } | undefined)
        ?.request;
      if (request !== null && typeof request === 'object') {
        rewrite(request as Record<string, unknown>, 'url');
      }
      node = obj.cause;
    }
    return err;
  }

  /** `err` rewrapped as this connect's transient code, or returned unchanged. */
  private __transportError(err: unknown, timeout: number | undefined): unknown {
    if (err instanceof RESTlerRateLimitError) {
      // RESTler retried once (maxRetryWait) and was throttled again, or the
      // vendor's hint exceeded the cap.
      return new TelegramError('RATE_LIMITED', {
        status: 429,
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new TelegramError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    // RESTlerResponseValidationError (and the two above) extend
    // RESTlerRequestError: only a bare one is a failure before any response.
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new TelegramError('NETWORK_ERROR', {}, err);
    }
    return err;
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
   * Validates `options` against `request`, then POSTs it as JSON to `path`
   * and validates the result against `response`. Every Bot API method
   * with a body goes through here.
   *
   * @throws {TelegramError} `REQUEST_VALIDATION_ERROR` before anything is
   * sent, or whatever {@link __requestAndValidate} throws.
   */
  private async __send<Q, B>(
    path: string,
    request: BaseGuardian<Q>,
    options: unknown,
    response: BaseGuardian<B>,
  ): Promise<B> {
    const payload = Telegram.__validate(request, options);
    return await this.__requestAndValidate(
      {
        path,
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      response,
    );
  }

  /**
   * Parses `input` with `guard`, rethrowing a failure as
   * `REQUEST_VALIDATION_ERROR`. Guardian's own errors describe a rejected
   * value by type and length only, so a secret (`secret_token`) is never
   * repeated in the error.
   */
  private static __validate<B>(guard: BaseGuardian<B>, input: unknown): B {
    const [error, value] = guard.safeParse(input);
    if (error) {
      throw new TelegramError('REQUEST_VALIDATION_ERROR', {
        reason: error.message,
        responseError: (error as GuardianError).toJSON(),
      }, error);
    }
    return value as B;
  }

  /** Case-insensitive single-header lookup across both {@link TelegramWebhookHeaders} shapes. */
  private static __header(
    headers: TelegramWebhookHeaders,
    name: string,
  ): string | null {
    if (headers === null || typeof headers !== 'object') return null;
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
      // A 429 without the Bot API envelope (e.g. from a proxy in front of
      // it) is still a rate limit — map it by status, not to RESPONSE_ERROR.
      if (status === 429) {
        const retryAfterSeconds = this._parseRetryAfter(response.headers);
        throw new TelegramError('RATE_LIMITED', {
          status,
          retryAfterSeconds,
          retryAfter: retryAfterSeconds ?? 'a few',
          body: response.body,
        });
      }
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
        // Telegram states the flood-control wait in the body
        // (`parameters.retry_after`); a header hint is the fallback.
        retryAfterSeconds: envelope.parameters?.retry_after ??
          this._parseRetryAfter(response.headers),
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
