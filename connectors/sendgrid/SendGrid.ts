import {
  type ResponseBody,
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerRateLimitError,
  type RESTlerRequestOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { decodeBase64 } from '@encoding';
import { ecdsaDerToRaw, verifyEC } from '@crypt';
import { type BaseGuardian, GuardianError } from '@guardian';
import {
  ErrorSchemaObject,
  type MailSendRequestSchema,
  MailSendRequestSchemaObject,
  type ScopesResponseSchema,
  ScopesResponseSchemaObject,
} from './schema/mod.ts';
import { SendGridError, type SendGridErrorCode } from './errors/mod.ts';

/**
 * SendGrid authentication — a Bearer API key sent on every request.
 * `RESTlerAuth`'s `BEARER` variant already matches this vendor's scheme
 * exactly; this narrows it to the one shape SendGrid actually accepts
 * (SendGrid has no Basic/custom-header auth mode to admit here).
 */
export type SendGridAuth = {
  type: 'BEARER';
  /** SendGrid API key (e.g. `SG.xxxxx`). */
  token: string;
  /** Authorization header scheme prefix. SendGrid documents `Bearer`. */
  prefix?: string;
};

/** Options for configuring a {@link SendGrid} client. */
export type SendGridOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link SendGridAuth}. */
  auth: SendGridAuth;
};

/** Result returned by {@link SendGrid.sendMail}. */
export type SendMailResult = {
  /**
   * SendGrid's per-request message identifier, read from the
   * `X-Message-Id` response header when present. This header is not part
   * of SendGrid's formal API contract, so it may be absent — never assume
   * it is set.
   */
  messageId?: string;
};

/**
 * Anything a runtime hands you as request headers — a `Headers` instance or
 * a plain object. Lookup is case-insensitive either way, as HTTP header
 * names are.
 */
export type WebhookHeadersLike =
  | Headers
  | Record<string, string | string[] | undefined>;

/** Arguments to {@link SendGrid.verifyWebhook}. */
export type VerifyWebhookOptions = {
  /** The RAW request body, byte-exact — SendGrid warns that re-serializing may drop characters. */
  payload: string;
  headers: WebhookHeadersLike;
  /** The Event Webhook verification key from the dashboard: base64 (SPKI), or a full PEM. */
  publicKey: string;
  /** Replay window in seconds — this connect's policy; SendGrid specifies none. @default 300 */
  toleranceSeconds?: number;
  /** Clock override, for tests. */
  nowMs?: number;
};

/**
 * SendGrid client for sending transactional email through the Twilio
 * SendGrid v3 REST API.
 *
 * Authenticates with a single Bearer API key — there is no separate
 * sandbox/production host; SendGrid's "sandbox mode" is a boolean flag
 * inside the `/mail/send` request payload (`mail_settings.sandbox_mode`),
 * not a different base URL.
 *
 * @example
 * ```typescript
 * import { SendGrid } from '@tundraconnect/sendgrid';
 *
 * const client = new SendGrid({
 *   auth: { type: 'BEARER', token: 'SG.xxxxx', prefix: 'Bearer' },
 * });
 *
 * const { messageId } = await client.sendMail({
 *   personalizations: [{ to: [{ email: 'dest@example.com' }] }],
 *   from: { email: 'sender@example.com' },
 *   subject: 'Hello',
 *   content: [{ type: 'text/plain', value: 'Hi there!' }],
 * });
 * console.log(messageId);
 * ```
 */
export class SendGrid extends RESTler<SendGridOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'SendGrid';

  /**
   * Creates a new SendGrid client instance.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'BEARER', token, prefix? }` — your
   * SendGrid API key as the Bearer token. RESTler's base `_authInjector`
   * already emits `Authorization: <prefix> <token>` for `type: 'BEARER'`,
   * so no auth override is needed here; pass `prefix: 'Bearer'` to match
   * SendGrid's documented casing.
   * @throws {SendGridError} `CONFIG_INVALID_API_KEY` if `auth` is missing,
   * isn't `type: 'BEARER'`, or its `token` is blank or not a string.
   */
  constructor(options: EventOptionKeys<SendGridOptions, RESTlerEvents>) {
    super(options, {
      baseURL: 'https://api.sendgrid.com/v3',
      timeout: 30,
      contentType: 'JSON',
    });
    // `auth` is required by the type, but a caller that bypasses the type
    // checker (or builds options dynamically) can omit it entirely.
    // `_setOptions` only routes keys actually PRESENT on the constructor
    // argument through `_processOption`, so an absent `auth` slips past
    // the switch-based validation below and would otherwise only surface
    // as a raw auth failure on the first request. Fail fast here instead —
    // mirrors RESTler's own `baseURL` guard in its constructor.
    if (!this._hasOption('auth')) {
      throw new SendGridError('CONFIG_INVALID_API_KEY', {});
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Send a transactional email via `POST /mail/send`.
   *
   * `request` is validated against {@link MailSendRequestSchema} before
   * anything is sent. A normal send returns `202 Accepted`; a send with
   * `mail_settings.sandbox_mode.enable: true` returns `200 OK` instead once
   * validation passes — this method treats both as success. Neither
   * response carries a body, so no body is parsed on success.
   *
   * @param request - The mail-send request.
   * @returns The (possibly empty) `X-Message-Id` response header.
   * @throws {SendGridError} `REQUEST_VALIDATION_ERROR` if `request` fails
   * local schema validation, or `AUTH_REQUIRED`, `VALIDATION_ERROR`,
   * `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`,
   * `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const { messageId } = await client.sendMail({
   *   personalizations: [{ to: [{ email: 'dest@example.com' }] }],
   *   from: { email: 'sender@example.com' },
   *   subject: 'Hello',
   *   content: [{ type: 'text/plain', value: 'Hi there!' }],
   * });
   * ```
   */
  public async sendMail(
    request: MailSendRequestSchema,
  ): Promise<SendMailResult> {
    let payload: MailSendRequestSchema;
    try {
      payload = MailSendRequestSchemaObject.parse(request);
    } catch (cause) {
      throw new SendGridError(
        'REQUEST_VALIDATION_ERROR',
        {},
        cause instanceof GuardianError ? cause : undefined,
      );
    }
    const resp = await this._makeRequest({
      path: '/mail/send',
      method: 'POST',
      contentType: 'JSON',
      payload: payload as unknown as Record<string, unknown>,
    });

    // `_responseHandler` already threw for any documented vendor error by
    // this point. Sandbox-mode-on successful validation returns 200 instead
    // of the normal 202 — both are success, and neither carries a body, so
    // there's nothing to run through `__requestAndValidate`; just read the
    // header.
    const messageId = resp.headers?.['x-message-id'];
    return messageId ? { messageId } : {};
  }

  /**
   * List the permission scopes granted to the configured API key, via
   * `GET /scopes`. A simple way to confirm a configured key is live and see
   * what it's permitted to do.
   *
   * @returns Promise resolving to {@link ScopesResponseSchema}.
   * @throws {SendGridError} `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`,
   * `RATE_LIMITED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const { scopes } = await client.getScopes();
   * console.log(scopes.includes('mail.send'));
   * ```
   */
  public getScopes(): Promise<ScopesResponseSchema> {
    return this.__requestAndValidate(
      { path: '/scopes', method: 'GET' },
      ScopesResponseSchemaObject,
    );
  }

  /**
   * Processes and validates configuration options specific to the
   * SendGrid client before passing them to the parent class.
   *
   * @throws {SendGridError} `CONFIG_INVALID_API_KEY` when `auth` is
   * present but isn't a `BEARER` auth with a non-empty `token`.
   */
  protected override _processOption<K extends keyof SendGridOptions>(
    key: K,
    value: SendGridOptions[K],
  ): SendGridOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as SendGridAuth;
        if (
          !auth || auth.type !== 'BEARER' ||
          typeof auth.token !== 'string' || auth.token.trim() === ''
        ) {
          // Never echo the raw `token` here (as a message placeholder or
          // as context) — it's a live SendGrid API key, and `context` is
          // stored on the thrown error verbatim (see `BaseError.toJSON`),
          // so anything placed here is just as exposed as the message
          // text.
          throw new SendGridError('CONFIG_INVALID_API_KEY', {});
        }
        value = {
          type: 'BEARER',
          token: auth.token.trim(),
          prefix: auth.prefix,
        } as SendGridOptions[K];
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
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
    return new SendGridError('RATE_LIMITED', {
      status: 429,
      retryAfterSeconds: err.getContextValue('retryAfter'),
      retried: err.getContextValue('retried'),
    }, err);
  }

  /**
   * Verifies a SendGrid Event Webhook delivery and returns the PARSED event
   * array.
   *
   * SendGrid's scheme is asymmetric: ECDSA over P-256 with SHA-256 on
   * `<timestamp><rawBody>` (no separator), the signature base64-DER in
   * `X-Twilio-Email-Event-Webhook-Signature`, the timestamp in
   * `X-Twilio-Email-Event-Webhook-Timestamp`, verified against the public
   * key the dashboard shows (base64 SPKI). `@tundralibs/crypt` does the
   * work: `ecdsaDerToRaw` converts DER to the raw R‖S `verifyEC` expects.
   *
   * @throws {SendGridError} `WEBHOOK_INVALID_HEADERS`,
   * `WEBHOOK_TIMESTAMP_INVALID`, `WEBHOOK_INVALID_KEY`,
   * `WEBHOOK_SIGNATURE_INVALID`, or `RESPONSE_ERROR` when the verified
   * payload is not JSON.
   *
   * @example
   * ```typescript
   * const raw = await req.text();
   * const events = await client.verifyWebhook({ payload: raw, headers: req.headers, publicKey: SENDGRID_WEBHOOK_KEY });
   * ```
   */
  public async verifyWebhook(options: VerifyWebhookOptions): Promise<unknown> {
    const {
      payload,
      headers,
      publicKey,
      toleranceSeconds = 300,
      nowMs = Date.now(),
    } = options;
    const signature = SendGrid.__webhookHeader(
      headers,
      'x-twilio-email-event-webhook-signature',
    );
    const timestamp = SendGrid.__webhookHeader(
      headers,
      'x-twilio-email-event-webhook-timestamp',
    );
    if (!signature || !timestamp) {
      throw new SendGridError('WEBHOOK_INVALID_HEADERS', {
        reason: `missing ${
          [
            !signature && 'X-Twilio-Email-Event-Webhook-Signature',
            !timestamp && 'X-Twilio-Email-Event-Webhook-Timestamp',
          ].filter(Boolean).join(', ')
        }`,
      });
    }
    const sentAtSec = Number(timestamp);
    if (!Number.isFinite(sentAtSec)) {
      throw new SendGridError('WEBHOOK_TIMESTAMP_INVALID', {
        reason: `'${timestamp}' is not a Unix timestamp in seconds`,
      });
    }
    // Both directions: a forged far-future timestamp would otherwise be
    // replayable forever.
    const driftSec = Math.abs(nowMs / 1000 - sentAtSec);
    if (driftSec > toleranceSeconds) {
      throw new SendGridError('WEBHOOK_TIMESTAMP_INVALID', {
        reason: `${
          Math.round(driftSec)
        }s drift exceeds the ${toleranceSeconds}s tolerance`,
      });
    }
    const trimmed = publicKey.trim();
    const pem = trimmed.includes('-----BEGIN')
      ? trimmed
      : `-----BEGIN PUBLIC KEY-----\n${
        trimmed.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? ''
      }\n-----END PUBLIC KEY-----`;
    let raw: string;
    try {
      raw = ecdsaDerToRaw(decodeBase64(signature), 'P-256');
    } catch {
      throw new SendGridError('WEBHOOK_SIGNATURE_INVALID', {});
    }
    let ok: boolean;
    try {
      ok = await verifyEC(`${timestamp}${payload}`, raw, pem, {
        curve: 'P-256',
        hashAlgorithm: 'SHA-256',
      });
    } catch (cause) {
      throw new SendGridError(
        'WEBHOOK_INVALID_KEY',
        {},
        cause instanceof Error ? cause : undefined,
      );
    }
    if (!ok) throw new SendGridError('WEBHOOK_SIGNATURE_INVALID', {});
    try {
      return JSON.parse(payload);
    } catch (cause) {
      throw new SendGridError(
        'RESPONSE_ERROR',
        {},
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError} into
   * a {@link SendGridError} — so `SendGridError` stays the only thing a
   * public method throws for "the vendor responded, but the body doesn't
   * match what was expected." `B` is inferred from `guard`, so callers no
   * longer separately write out a `_makeRequest<B>()` type argument.
   *
   * By the time a method calls this, {@link _responseHandler} has already
   * run and thrown for any documented vendor error — this only has to
   * handle a response whose status looked fine but whose body doesn't match
   * what was expected.
   *
   * @template B - The expected response body type.
   * @param endpoint - The endpoint to request.
   * @param guard - Guardian schema object for validating the response.
   * @returns The validated response data.
   * @throws {SendGridError} `RESPONSE_ERROR` when the body fails validation.
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
        throw new SendGridError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates SendGrid's
   * HTTP-status/error-envelope conventions into a {@link SendGridError}.
   * Runs on every response (registered on `_responseHandler` in the
   * constructor); does nothing for a response below 400, including
   * `sendMail`'s `200` (sandbox mode) and `202` (normal send) successes,
   * leaving success-body validation to {@link __requestAndValidate}.
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {SendGridError} `AUTH_REQUIRED`, `VALIDATION_ERROR`,
   * `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`,
   * `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`, matching the
   * vendor's documented status/message pairs.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    const [err, body] = ErrorSchemaObject.safeParse(response.body);
    const code = this.__errorCodeForStatus(status);
    if (body) {
      throw new SendGridError(code, {
        retryAfterSeconds: this._parseRetryAfter(response.headers),
        status,
        errors: body.errors,
        id: body.id,
      });
    }
    // Body missing or didn't match the documented error envelope — fall
    // back to SERVICE_UNAVAILABLE for 5xx (the vendor's own outage/error
    // pages rarely follow the JSON contract), otherwise the status-mapped
    // code with the raw body attached for diagnostics.
    throw new SendGridError(
      status >= 500 ? 'SERVICE_UNAVAILABLE' : code,
      {
        status,
        body: response.body,
        responseError: err?.toJSON(),
      },
    );
  }

  /** Map an HTTP status code to a stable, connect-specific error code. */
  private __errorCodeForStatus(status: number | null): SendGridErrorCode {
    switch (status) {
      case 400:
        return 'VALIDATION_ERROR';
      case 401:
        return 'AUTH_REQUIRED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 405:
        return 'METHOD_NOT_ALLOWED';
      case 413:
        return 'PAYLOAD_TOO_LARGE';
      case 429:
        return 'RATE_LIMITED';
      default:
        if (status !== null && status >= 500) return 'SERVICE_UNAVAILABLE';
        return 'UNKNOWN_ERROR';
    }
  }
}
