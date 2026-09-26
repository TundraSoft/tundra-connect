import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerRateLimitError,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { decodeBase64, encodeBase64 } from '@encoding';
import { constantTimeEqual } from '@crypt';
import type { BaseGuardian, GuardianError } from '@guardian';
import { ResendError } from './errors/mod.ts';
import {
  type AttachmentSchema,
  type EmailRefSchema,
  EmailRefSchemaObject,
  type EmailSchema,
  EmailSchemaObject,
  ErrorResponseSchemaObject,
  type SendBatchResponseSchema,
  SendBatchResponseSchemaObject,
  type SendEmailRequestSchema,
  SendEmailRequestSchemaObject,
  type TagSchema,
  type TemplateSchema,
  type WebhookEventSchema,
  WebhookEventSchemaObject,
} from './schema/mod.ts';

/** Resend's REST API root. */
export const RESEND_API = 'https://api.resend.com';

/** Most emails one `POST /emails/batch` call accepts. */
export const MAX_BATCH_SIZE = 100;

/**
 * `User-Agent` sent when the caller configures none. Resend rejects any
 * request WITHOUT a `User-Agent` with a 403, and server runtimes' `fetch`
 * doesn't reliably add one — so this connect always does.
 */
export const DEFAULT_USER_AGENT = 'tundraconnect-resend';

/** Svix's (and so Resend's) recommended webhook replay window, in seconds. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Resend authenticates with a plain Bearer API key (`re_...`), so `BEARER`
 * is the only shape admitted here — RESTler's base `_authInjector` already
 * emits `Authorization: Bearer <key>`, which is why this connect has no
 * `_authInjector` override.
 *
 * A "sending access" key can only call {@link Resend.send} and
 * {@link Resend.sendBatch}; retrieving, rescheduling or cancelling an email
 * needs a "full access" key and otherwise fails with `AUTH_FAILED`.
 */
export type ResendAuth = {
  type: 'BEARER';
  /** Resend API key, from https://resend.com/api-keys. */
  token: string;
  /** Authorization header scheme prefix. Defaults to `Bearer`, as Resend documents. */
  prefix?: string;
};

/** Options for configuring a {@link Resend} client. */
export type ResendOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link ResendAuth}. */
  auth: ResendAuth;
};

/**
 * One email, as passed to {@link Resend.send} / {@link Resend.sendBatch}.
 *
 * Field names are Resend's own (`reply_to`, `scheduled_at`) so a body
 * copied straight out of the vendor's docs works unchanged. `to`, `cc`,
 * `bcc` and `reply_to` accept a bare string as well as an array.
 */
export type SendEmailOptions = {
  /** Sender — `you@yourdomain.com` or `Your Name <you@yourdomain.com>`, on a verified domain. */
  from: string;
  /** Recipient(s), at most 50. */
  to: string | string[];
  /** Subject line. */
  subject: string;
  /** HTML body. One of `html`, `text` or `template` is required. */
  html?: string;
  /** Plain-text body. Resend derives one from `html` when omitted. */
  text?: string;
  /** Carbon-copy recipient(s). */
  cc?: string | string[];
  /** Blind-carbon-copy recipient(s). */
  bcc?: string | string[];
  /** Reply-to address(es). */
  reply_to?: string | string[];
  /** Custom email headers, e.g. `{ 'List-Unsubscribe': '<https://...>' }`. */
  headers?: Record<string, string>;
  /** Attachments (base64 `content` or a remote `path`). Not allowed in a batch. */
  attachments?: AttachmentSchema[];
  /** Custom tags, echoed back by {@link Resend.getEmail} and in webhooks. */
  tags?: TagSchema[];
  /**
   * Send later — ISO 8601 or natural language (`in 1 hour`). Not allowed
   * in a batch.
   */
  scheduled_at?: string;
  /** Topic id governing contact subscription preferences. */
  topic_id?: string;
  /** A published template to render instead of `html`/`text`. */
  template?: TemplateSchema;
};

/** Per-call options for {@link Resend.send} and {@link Resend.sendBatch}. */
export type SendRequestOptions = {
  /**
   * Resend's `Idempotency-Key` (1–256 characters, remembered for 24 hours).
   * Retrying with the same key and body returns the original result
   * instead of sending twice — derive it from YOUR record
   * (`welcome-user-123`), not a fresh random value per attempt.
   */
  idempotencyKey?: string;
};

/**
 * Anything a runtime hands you as request headers — a `Headers` instance or
 * a plain object. Lookup is case-insensitive either way.
 */
export type WebhookHeadersLike =
  | Headers
  | Record<string, string | string[] | undefined>;

/** Arguments to {@link Resend.verifyWebhook}. */
export type VerifyWebhookOptions = {
  /** The RAW request body, exactly as received — `await req.text()`, never a re-serialized object. */
  payload: string;
  /** The request headers (`svix-id`, `svix-timestamp`, `svix-signature`). */
  headers: WebhookHeadersLike;
  /** The endpoint's signing secret from the Resend dashboard (`whsec_...`). */
  secret: string;
  /** Replay window in seconds. @default DEFAULT_WEBHOOK_TOLERANCE_SECONDS */
  toleranceSeconds?: number;
  /** Clock override, for tests. */
  nowMs?: number;
};

/** The error codes {@link Resend.__toError} can produce. */
type VendorErrorName =
  | 'INVALID_REQUEST'
  | 'AUTH_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CONFLICT'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

/**
 * Maps Resend's documented error `name`s onto this connect's stable codes.
 * A name absent here — including `restricted_api_key`, which Resend uses at
 * both 401 and 403 — falls back to HTTP-status mapping.
 */
const VENDOR_NAME_MAP: Record<string, VendorErrorName> = {
  validation_error: 'INVALID_REQUEST',
  invalid_idempotency_key: 'INVALID_REQUEST',
  invalid_attachment: 'INVALID_REQUEST',
  invalid_parameter: 'INVALID_REQUEST',
  missing_required_field: 'INVALID_REQUEST',
  missing_required_parameter: 'INVALID_REQUEST',
  method_not_allowed: 'INVALID_REQUEST',
  missing_api_key: 'AUTH_FAILED',
  invalid_permission: 'FORBIDDEN',
  suspended_api_key: 'FORBIDDEN',
  email_above_quota: 'FORBIDDEN',
  not_found: 'NOT_FOUND',
  concurrent_idempotent_requests: 'IDEMPOTENCY_CONFLICT',
  invalid_idempotent_request: 'IDEMPOTENCY_CONFLICT',
  resource_locked: 'CONFLICT',
  daily_quota_exceeded: 'QUOTA_EXCEEDED',
  monthly_quota_exceeded: 'QUOTA_EXCEEDED',
  rate_limit_exceeded: 'RATE_LIMITED',
  application_error: 'SERVICE_UNAVAILABLE',
  service_unavailable: 'SERVICE_UNAVAILABLE',
};

/**
 * Resend client — transactional email over `https://api.resend.com`: send
 * one email or a batch of up to 100, retrieve a sent email's delivery
 * status, reschedule or cancel a scheduled email, and verify Svix-signed
 * webhooks.
 *
 * @example
 * ```typescript
 * import { Resend } from '@tundraconnect/resend';
 *
 * const client = new Resend({
 *   auth: { type: 'BEARER', token: 're_123456789' },
 * });
 *
 * const { id } = await client.send({
 *   from: 'Acme <onboarding@yourdomain.com>',
 *   to: 'recipient@example.com',
 *   subject: 'Welcome to Acme!',
 *   html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
 * });
 * console.log('sent', id);
 * ```
 */
export class Resend extends RESTler<ResendOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Resend';

  /**
   * Creates a Resend client.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'BEARER', token, prefix? }` — a Resend
   * API key.
   * @throws {ResendError} `CONFIG_INVALID_API_KEY` when `auth` is missing,
   * isn't `type: 'BEARER'`, or its `token` is blank.
   */
  constructor(options: EventOptionKeys<ResendOptions, RESTlerEvents>) {
    super(options, {
      baseURL: RESEND_API,
      timeout: 30,
      contentType: 'JSON',
    });
    // `_setOptions` only validates keys actually PRESENT on the argument, so
    // an omitted `auth` would otherwise surface as a 401 at the first call.
    if (!this._hasOption('auth')) {
      throw new ResendError('CONFIG_INVALID_API_KEY');
    }
    const hasUserAgent = Object.keys(this._defaultHeaders).some((key) =>
      key.toLowerCase() === 'user-agent'
    );
    if (!hasUserAgent) {
      this._defaultHeaders = {
        ...this._defaultHeaders,
        'User-Agent': DEFAULT_USER_AGENT,
      };
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  // ── Sending ─────────────────────────────────────────────────────────────

  /**
   * Send one email — `POST /emails`.
   *
   * `email` is validated locally before anything is sent: sender and
   * recipient shapes, the 50-recipient `to` cap, tag and template-variable
   * character rules, attachment encoding, and that one of `html`, `text`
   * or `template` is present.
   *
   * @param email - The email to send.
   * @param options - Optional `idempotencyKey`.
   * @returns The new email's `id` — keep it for {@link getEmail},
   * {@link rescheduleEmail} and {@link cancelEmail}, and to match webhook
   * events (`data.email_id`) back to your records.
   * @throws {ResendError} `REQUEST_VALIDATION_ERROR` when `email` or the
   * idempotency key fails local validation; `INVALID_REQUEST`,
   * `AUTH_FAILED`, `FORBIDDEN`, `IDEMPOTENCY_CONFLICT`, `QUOTA_EXCEEDED`,
   * `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or `UNKNOWN_ERROR` when Resend
   * rejects it; `RESPONSE_ERROR` when a success body fails validation.
   *
   * @example
   * ```typescript
   * const { id } = await client.send(
   *   {
   *     from: 'Acme <billing@yourdomain.com>',
   *     to: ['customer@example.com'],
   *     subject: 'Your invoice',
   *     text: 'Your invoice is attached.',
   *     attachments: [{ content: btoa('invoice body'), filename: 'invoice.txt' }],
   *     tags: [{ name: 'invoice_id', value: 'inv_123' }],
   *   },
   *   { idempotencyKey: 'invoice-inv_123' },
   * );
   * ```
   */
  public async send(
    email: SendEmailOptions,
    options: SendRequestOptions = {},
  ): Promise<EmailRefSchema> {
    const payload = Resend.__validateEmail(email, 'email');
    return await this.__requestAndValidate(
      {
        path: '/emails',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
        headers: Resend.__idempotencyHeaders(options.idempotencyKey),
      },
      EmailRefSchemaObject,
    );
  }

  /**
   * Send up to {@link MAX_BATCH_SIZE} emails in one request —
   * `POST /emails/batch`.
   *
   * The batch is all-or-nothing: if Resend rejects any email, none are
   * sent. `attachments` and `scheduled_at` are not supported in a batch,
   * so they are rejected locally rather than silently dropped.
   *
   * @param emails - 1 to {@link MAX_BATCH_SIZE} emails.
   * @param options - Optional `idempotencyKey` covering the whole batch.
   * @returns `data[i]` is the id of `emails[i]`.
   * @throws {ResendError} `REQUEST_VALIDATION_ERROR` when the batch or any
   * email fails local validation (its `index` is in the error context);
   * otherwise the same codes as {@link send}.
   *
   * @example
   * ```typescript
   * const { data } = await client.sendBatch([
   *   { from: 'a@yourdomain.com', to: 'x@example.com', subject: 'Hi X', text: 'Hi' },
   *   { from: 'a@yourdomain.com', to: 'y@example.com', subject: 'Hi Y', text: 'Hi' },
   * ]);
   * console.log(data.map((ref) => ref.id));
   * ```
   */
  public async sendBatch(
    emails: SendEmailOptions[],
    options: SendRequestOptions = {},
  ): Promise<SendBatchResponseSchema> {
    if (
      !Array.isArray(emails) || emails.length === 0 ||
      emails.length > MAX_BATCH_SIZE
    ) {
      throw new ResendError('REQUEST_VALIDATION_ERROR', {
        reason: `a batch must contain 1-${MAX_BATCH_SIZE} emails`,
      });
    }
    const payload = emails.map((email, index) => {
      const parsed = Resend.__validateEmail(email, `emails[${index}]`, index);
      for (const field of ['attachments', 'scheduled_at'] as const) {
        if (parsed[field] !== undefined) {
          throw new ResendError('REQUEST_VALIDATION_ERROR', {
            reason:
              `emails[${index}].${field} is not supported on batch sends — use send() for this email`,
            index,
          });
        }
      }
      return parsed;
    });
    return await this.__requestAndValidate(
      {
        path: '/emails/batch',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
        headers: Resend.__idempotencyHeaders(options.idempotencyKey),
      },
      SendBatchResponseSchemaObject,
    );
  }

  // ── Managing sent email ─────────────────────────────────────────────────

  /**
   * Retrieve one email and its latest delivery event — `GET /emails/{id}`.
   *
   * @throws {ResendError} `NOT_FOUND` when no such email exists;
   * `AUTH_FAILED` with a sending-only API key; plus the usual vendor and
   * validation codes.
   *
   * @example
   * ```typescript
   * const email = await client.getEmail(id);
   * if (email.last_event === 'bounced') markAddressBad(email.to);
   * ```
   */
  public async getEmail(emailId: string): Promise<EmailSchema> {
    Resend.__requireId(emailId);
    return await this.__requestAndValidate(
      { path: `/emails/${encodeURIComponent(emailId)}`, method: 'GET' },
      EmailSchemaObject,
    );
  }

  /**
   * Move a scheduled email to a new send time — `PATCH /emails/{id}`.
   *
   * Only an email that was sent with `scheduled_at` and has not gone out
   * yet can be rescheduled.
   *
   * @param emailId - The scheduled email's id.
   * @param scheduledAt - New send time, ISO 8601 (or natural language,
   * which Resend also accepts at send time).
   * @throws {ResendError} `REQUEST_VALIDATION_ERROR` for a blank id or
   * time; `NOT_FOUND`, `INVALID_REQUEST` when the email can no longer be
   * rescheduled, plus the usual vendor codes.
   *
   * @example
   * ```typescript
   * await client.rescheduleEmail(id, '2026-12-24T09:00:00Z');
   * ```
   */
  public async rescheduleEmail(
    emailId: string,
    scheduledAt: string,
  ): Promise<EmailRefSchema> {
    Resend.__requireId(emailId);
    if (typeof scheduledAt !== 'string' || scheduledAt.trim() === '') {
      throw new ResendError('REQUEST_VALIDATION_ERROR', {
        reason: '`scheduledAt` must be a non-empty string',
      });
    }
    return await this.__requestAndValidate(
      {
        path: `/emails/${encodeURIComponent(emailId)}`,
        method: 'PATCH',
        contentType: 'JSON',
        payload: { scheduled_at: scheduledAt },
      },
      EmailRefSchemaObject,
    );
  }

  /**
   * Cancel a scheduled email before it sends — `POST /emails/{id}/cancel`.
   *
   * @throws {ResendError} `REQUEST_VALIDATION_ERROR` for a blank id;
   * `NOT_FOUND`, `INVALID_REQUEST` when the email has already sent, plus
   * the usual vendor codes.
   *
   * @example
   * ```typescript
   * await client.cancelEmail(id);
   * ```
   */
  public async cancelEmail(emailId: string): Promise<EmailRefSchema> {
    Resend.__requireId(emailId);
    return await this.__requestAndValidate(
      {
        path: `/emails/${encodeURIComponent(emailId)}/cancel`,
        method: 'POST',
      },
      EmailRefSchemaObject,
    );
  }

  // ── Webhooks ────────────────────────────────────────────────────────────

  /**
   * The exact string Svix signs: `<id>.<timestamp>.<payload>`.
   *
   * @example
   * ```typescript
   * Resend.webhookSignedContent('msg_1', '1700000000', '{"a":1}');
   * // 'msg_1.1700000000.{"a":1}'
   * ```
   */
  public static webhookSignedContent(
    webhookId: string,
    timestamp: string,
    payload: string,
  ): string {
    return `${webhookId}.${timestamp}.${payload}`;
  }

  /**
   * Verifies a Resend webhook's signature and returns the PARSED event.
   *
   * Resend delivers webhooks through Svix: `svix-id`, `svix-timestamp` and
   * `svix-signature` (space-separated `v1,<base64>` entries — several
   * during secret rotation), HMAC-SHA256 over
   * `<svix-id>.<svix-timestamp>.<rawBody>` keyed by the base64-DECODED
   * `whsec_` secret. The equivalent Standard Webhooks `webhook-*` header
   * names are accepted too. That decoded-bytes key is why the HMAC stays on
   * Web Crypto rather than `@crypt`'s `signHMAC` (text key, hex output);
   * the constant-time comparison does come from `@crypt`.
   *
   * No API key is involved — webhook verification works on any client.
   *
   * @throws {ResendError} `WEBHOOK_INVALID_HEADERS`,
   * `WEBHOOK_TIMESTAMP_INVALID`, `WEBHOOK_SIGNATURE_INVALID`,
   * `WEBHOOK_INVALID_SECRET`, or `WEBHOOK_INVALID_PAYLOAD` when the
   * verified body is not a Resend event.
   *
   * @example
   * ```typescript
   * const raw = await req.text(); // text(), never json()
   * const event = await client.verifyWebhook({
   *   payload: raw,
   *   headers: req.headers,
   *   secret: RESEND_WEBHOOK_SECRET,
   * });
   * if (event.type === 'email.bounced') handleBounce(event.data);
   * ```
   */
  public async verifyWebhook(
    options: VerifyWebhookOptions,
  ): Promise<WebhookEventSchema> {
    const {
      payload,
      headers,
      secret,
      toleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
      nowMs = Date.now(),
    } = options;
    const id = Resend.__webhookHeader(headers, 'id');
    const timestamp = Resend.__webhookHeader(headers, 'timestamp');
    const signature = Resend.__webhookHeader(headers, 'signature');
    const missing = [
      ['svix-id', id],
      ['svix-timestamp', timestamp],
      ['svix-signature', signature],
    ].filter(([, v]) => !v).map(([n]) => n);
    if (missing.length > 0) {
      throw new ResendError('WEBHOOK_INVALID_HEADERS', {
        reason: `missing ${missing.join(', ')}`,
      });
    }
    const sentAtSec = Number(timestamp);
    if (!/^\d+$/.test(timestamp!) || !Number.isSafeInteger(sentAtSec)) {
      throw new ResendError('WEBHOOK_TIMESTAMP_INVALID', {
        reason: `'${timestamp}' is not a Unix timestamp in seconds`,
      });
    }
    // Both directions: a forged far-future timestamp would otherwise be
    // replayable until that moment arrives.
    const driftSec = Math.abs(nowMs / 1000 - sentAtSec);
    if (driftSec > toleranceSeconds) {
      throw new ResendError('WEBHOOK_TIMESTAMP_INVALID', {
        reason: `${
          Math.round(driftSec)
        }s drift exceeds the ${toleranceSeconds}s tolerance`,
      });
    }
    const rawSecret = typeof secret === 'string' && secret.startsWith('whsec_')
      ? secret.slice(6)
      : secret;
    let keyBytes: Uint8Array;
    try {
      if (typeof rawSecret !== 'string' || rawSecret === '') {
        throw new Error('empty secret');
      }
      keyBytes = decodeBase64(rawSecret);
    } catch (cause) {
      throw new ResendError(
        'WEBHOOK_INVALID_SECRET',
        {},
        cause instanceof Error ? cause : undefined,
      );
    }
    // Raw Web Crypto: the key is DECODED bytes and the output base64 —
    // `@crypt`'s `signHMAC` takes a text key and returns hex (see
    // CONVENTIONS.md's "Cryptography and identifiers").
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes as unknown as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(
          Resend.webhookSignedContent(id!, timestamp!, payload),
        ) as unknown as BufferSource,
      ),
    );
    const expected = encodeBase64(mac);
    // Every candidate compared in constant time; no early break on success.
    let matched = false;
    for (const entry of signature!.split(' ')) {
      const comma = entry.indexOf(',');
      if (comma === -1 || entry.slice(0, comma) !== 'v1') continue;
      if (constantTimeEqual(entry.slice(comma + 1), expected)) matched = true;
    }
    if (!matched) throw new ResendError('WEBHOOK_SIGNATURE_INVALID', {});

    let body: unknown;
    try {
      body = JSON.parse(payload);
    } catch (cause) {
      throw new ResendError(
        'WEBHOOK_INVALID_PAYLOAD',
        { reason: 'body is not JSON' },
        cause instanceof Error ? cause : undefined,
      );
    }
    const [error, event] = WebhookEventSchemaObject.safeParse(body);
    if (error || !event) {
      throw new ResendError('WEBHOOK_INVALID_PAYLOAD', {
        reason: error?.message ?? 'validation failed',
        responseError: (error as GuardianError | null)?.toJSON(),
      });
    }
    return event;
  }

  // ── internals ───────────────────────────────────────────────────────────

  /**
   * Validates one email against the wire schema plus the cross-field
   * "needs a body" rule, re-throwing as this connect's error.
   */
  private static __validateEmail(
    email: SendEmailOptions,
    label: string,
    index?: number,
  ): SendEmailRequestSchema {
    let payload: SendEmailRequestSchema;
    try {
      payload = SendEmailRequestSchemaObject.parse(email);
    } catch (cause) {
      throw new ResendError(
        'REQUEST_VALIDATION_ERROR',
        {
          reason: `${label}: ${
            cause instanceof Error ? cause.message : 'validation failed'
          }`,
          index,
          responseError: (cause as GuardianError | undefined)?.toJSON?.(),
        },
        cause instanceof Error ? cause : undefined,
      );
    }
    if (
      payload.html === undefined && payload.text === undefined &&
      payload.template === undefined
    ) {
      throw new ResendError('REQUEST_VALIDATION_ERROR', {
        reason:
          `${label}: one of \`html\`, \`text\` or \`template\` is required`,
        index,
      });
    }
    return payload;
  }

  /** Builds the `Idempotency-Key` header, enforcing Resend's 1–256 character rule locally. */
  private static __idempotencyHeaders(
    key: string | undefined,
  ): Record<string, string> | undefined {
    if (key === undefined) return undefined;
    if (typeof key !== 'string' || key.length === 0 || key.length > 256) {
      throw new ResendError('REQUEST_VALIDATION_ERROR', {
        reason: '`idempotencyKey` must be 1-256 characters',
      });
    }
    return { 'Idempotency-Key': key };
  }

  /** Rejects a blank email id before it becomes a request to the collection endpoint. */
  private static __requireId(value: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ResendError('REQUEST_VALIDATION_ERROR', {
        reason: '`emailId` must be a non-empty string',
      });
    }
  }

  /**
   * Case-insensitive lookup of a Svix webhook header (`svix-<name>`),
   * falling back to its Standard Webhooks alias (`webhook-<name>`).
   */
  private static __webhookHeader(
    headers: WebhookHeadersLike,
    name: 'id' | 'timestamp' | 'signature',
  ): string | null {
    return Resend.__header(headers, `svix-${name}`) ??
      Resend.__header(headers, `webhook-${name}`);
  }

  /** Case-insensitive single-header lookup across both {@link WebhookHeadersLike} shapes. */
  private static __header(
    headers: WebhookHeadersLike,
    name: string,
  ): string | null {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      return headers.get(name);
    }
    for (const [key, value] of Object.entries(headers ?? {})) {
      if (key.toLowerCase() !== name) continue;
      return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
    }
    return null;
  }

  /**
   * Validates the options this connect owns beyond `RESTlerOptions`.
   * Runs only for keys present on the constructor argument — the
   * constructor's own `hasOption` guard covers the absent case.
   */
  protected override _processOption<K extends keyof ResendOptions>(
    key: K,
    value: ResendOptions[K],
  ): ResendOptions[K] {
    if (key === 'auth') {
      const auth = value as unknown as ResendAuth;
      if (
        !auth || auth.type !== 'BEARER' || typeof auth.token !== 'string' ||
        auth.token.trim() === ''
      ) {
        throw new ResendError('CONFIG_INVALID_API_KEY');
      }
      // RESTler's own default scheme is the literal `BEARER`; default to the
      // `Bearer` Resend documents so callers never need to pass `prefix`.
      value = { ...auth, prefix: auth.prefix ?? 'Bearer' } as ResendOptions[K];
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic errors into a {@link ResendError}. Every
   * endpoint goes through here, so this is also the one place RESTler's
   * {@link RESTlerRateLimitError} is rewrapped.
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
        throw new ResendError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      if (err instanceof RESTlerRateLimitError) {
        // RESTler retried once (maxRetryWait) and was throttled again, or the
        // vendor's hint exceeded the cap — surface it as this connect's own
        // error, with the hint and whether a wait already happened.
        throw new ResendError('RATE_LIMITED', {
          status: 429,
          retryAfterSeconds: err.getContextValue('retryAfter'),
          retried: err.getContextValue('retried'),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler. Resend returns
   * `{ statusCode, name, message }` on failure; `name` is mapped through
   * {@link VENDOR_NAME_MAP} and preserved as `vendorName`, falling back to
   * HTTP status for an unknown name or a body that isn't Resend's (a
   * gateway error serving HTML, say).
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body;

    const [, parsed] = ErrorResponseSchemaObject.safeParse(response.body);
    const detail = parsed ? `${parsed.message} (${parsed.name})` : 'no detail';
    const code: VendorErrorName = (parsed && VENDOR_NAME_MAP[parsed.name]) ??
      Resend.__statusToCode(status);

    throw new ResendError(code, {
      retryAfterSeconds: this._parseRetryAfter(response.headers),
      status,
      detail,
      vendorName: parsed?.name,
      body: response.body,
    });
  }

  /** HTTP-status fallback for a failure carrying no recognizable vendor name. */
  private static __statusToCode(status: number): VendorErrorName {
    if (status === 401) return 'AUTH_FAILED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 429) return 'RATE_LIMITED';
    if (status === 400 || status === 405 || status === 422) {
      return 'INVALID_REQUEST';
    }
    if (status >= 500) return 'SERVICE_UNAVAILABLE';
    return 'UNKNOWN_ERROR';
  }
}
