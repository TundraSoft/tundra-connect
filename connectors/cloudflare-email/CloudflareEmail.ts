import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import type { BaseGuardian, GuardianError } from '@guardian';
import { CloudflareEmailError } from './errors/mod.ts';
import {
  type AttachmentSchema,
  ErrorEnvelopeSchemaObject,
  MAX_RECIPIENTS,
  type SendEmailRequestSchema,
  SendEmailRequestSchemaObject,
  type SendEmailResultSchema,
  SendEmailResultSchemaObject,
} from './schema/mod.ts';

/** Cloudflare's v4 REST API root. */
export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

/**
 * Cloudflare authenticates the Email Sending API with a plain Bearer API
 * token, so `BEARER` is the only shape admitted here — RESTler's base
 * `_authInjector` already emits `Authorization: Bearer <token>` for it,
 * which is why this connect has no `_authInjector` override at all.
 *
 * The token needs the **Send Email** permission; one that authenticates
 * but lacks it fails at send time as `FORBIDDEN`, not `AUTH_FAILED`.
 */
export type CloudflareEmailAuth = {
  type: 'BEARER';
  /** Cloudflare API token with the Email Sending permission. */
  token: string;
  /** Authorization header scheme prefix. Cloudflare documents `Bearer`. */
  prefix?: string;
};

/** Options for configuring a {@link CloudflareEmail} client. */
export type CloudflareEmailOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link CloudflareEmailAuth}. */
  auth: CloudflareEmailAuth;
  /**
   * Cloudflare account id that owns the verified sending domain — the
   * `{account_id}` path segment of the send endpoint. Found in the
   * dashboard URL, or via `GET /accounts`.
   */
  accountId: string;
};

/**
 * Arguments to {@link CloudflareEmail.send}.
 *
 * Field names are Cloudflare's own (`reply_to`, not `replyTo`) so a body
 * copied straight out of the vendor's docs works unchanged — the same
 * choice the SendGrid connect makes for the same reason. The one
 * ergonomic addition is that `to`/`cc`/`bcc` accept a bare string as well
 * as an array; see {@link SendEmailRequestSchema}.
 */
export type SendEmailOptions = {
  /** Sender address, on a domain verified in this Cloudflare account. */
  from: string;
  /** Recipient(s). A bare string is normalized to a single-element array. */
  to: string | string[];
  /** Subject line. */
  subject: string;
  /** HTML body. At least one of `html`/`text` must be supplied. */
  html?: string;
  /** Plain-text body. At least one of `html`/`text` must be supplied. */
  text?: string;
  /** Carbon-copy recipient(s). */
  cc?: string | string[];
  /** Blind-carbon-copy recipient(s). */
  bcc?: string | string[];
  /** Address replies should go to, when it differs from `from`. */
  reply_to?: string;
  /** Custom headers, e.g. `{ 'List-Unsubscribe': '<https://...>' }`. */
  headers?: Record<string, string>;
  /** Base64-encoded attachments. */
  attachments?: AttachmentSchema[];
};

/**
 * Maps Cloudflare's documented numeric Email Sending error codes onto this
 * connect's stable code names. A numeric code absent from this table falls
 * back to HTTP-status mapping in {@link CloudflareEmail.__toError}.
 */
const VENDOR_CODE_MAP: Record<number, CloudflareEmailErrorName> = {
  10001: 'INVALID_REQUEST',
  10002: 'SERVICE_UNAVAILABLE',
  10004: 'RATE_LIMITED',
  10101: 'AUTH_FAILED',
  10102: 'FORBIDDEN',
  10105: 'ACCOUNT_NOT_ENTITLED',
  10200: 'MESSAGE_TOO_LARGE',
};

/** The subset of error codes `__toError` can produce from a vendor response. */
type CloudflareEmailErrorName =
  | 'INVALID_REQUEST'
  | 'SERVICE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'FORBIDDEN'
  | 'ACCOUNT_NOT_ENTITLED'
  | 'MESSAGE_TOO_LARGE'
  | 'UNKNOWN_ERROR';

/**
 * Cloudflare Email Sending client — transactional email over the
 * `client/v4` REST API
 * (`POST /accounts/{account_id}/email/sending/send`).
 *
 * This wraps the REST send endpoint, NOT the Workers `send_email` binding.
 * The binding is a runtime-only capability available inside a Cloudflare
 * Worker and could not extend `RESTler` or run on Deno/Bun/Node; the REST
 * API is plain HTTP and runs everywhere this repo targets.
 *
 * Email Sending is a Workers Paid beta at the time of writing — an account
 * without the entitlement fails every send with `ACCOUNT_NOT_ENTITLED`.
 *
 * @example
 * ```typescript
 * import { CloudflareEmail } from '@tundraconnect/cloudflare-email';
 *
 * const client = new CloudflareEmail({
 *   accountId: 'YOUR_ACCOUNT_ID',
 *   auth: { type: 'BEARER', token: 'YOUR_API_TOKEN', prefix: 'Bearer' },
 * });
 *
 * const result = await client.send({
 *   from: 'welcome@yourdomain.com',
 *   to: 'recipient@example.com',
 *   subject: 'Welcome to our service!',
 *   html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
 *   text: 'Welcome! Thanks for signing up.',
 * });
 * console.log(result.delivered, result.queued);
 * ```
 */
export class CloudflareEmail extends RESTler<CloudflareEmailOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'CloudflareEmail';

  /** The configured Cloudflare account id. */
  get accountId(): string {
    return this._getOption('accountId');
  }

  /**
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'BEARER', token, prefix? }` — a
   * Cloudflare API token carrying the Email Sending permission.
   * @param options.accountId - The account that owns the verified sending
   * domain.
   * @throws {CloudflareEmailError} `CONFIG_INVALID_API_TOKEN` when `auth`
   * is missing, isn't `type: 'BEARER'`, or its `token` is blank;
   * `CONFIG_INVALID_ACCOUNT_ID` when `accountId` is missing or blank.
   */
  constructor(options: EventOptionKeys<CloudflareEmailOptions, RESTlerEvents>) {
    super(options, {
      baseURL: CLOUDFLARE_API,
      timeout: 30,
      contentType: 'JSON',
    });
    // `_setOptions` only routes keys actually PRESENT on the constructor
    // argument through `_processOption`, so an omitted key slips past the
    // validation there entirely and would otherwise surface as a 401 or a
    // request to `/accounts/undefined/...`. Fail fast here instead —
    // mirrors the SendGrid connect's identical guard.
    if (!this.hasOption('auth')) {
      throw new CloudflareEmailError('CONFIG_INVALID_API_TOKEN');
    }
    if (!this.hasOption('accountId')) {
      throw new CloudflareEmailError('CONFIG_INVALID_ACCOUNT_ID');
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Send one email via
   * `POST /accounts/{account_id}/email/sending/send`.
   *
   * `options` is validated locally before anything is sent: address shapes
   * and attachment encoding via {@link SendEmailRequestSchema}, plus the
   * two cross-field rules that an object schema can't express — at least
   * one of `html`/`text`, and a combined `to`+`cc`+`bcc` count within
   * {@link MAX_RECIPIENTS}.
   *
   * @param options - The message to send.
   * @returns The unwrapped `result` payload — per-recipient delivery
   * disposition plus an optional message id.
   * @throws {CloudflareEmailError} `REQUEST_VALIDATION_ERROR` when
   * `options` fails local validation; `AUTH_FAILED`, `FORBIDDEN`,
   * `ACCOUNT_NOT_ENTITLED`, `INVALID_REQUEST`, `MESSAGE_TOO_LARGE`,
   * `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or `UNKNOWN_ERROR` when
   * Cloudflare rejects it; `RESPONSE_ERROR` when a success body fails
   * validation.
   *
   * @example
   * ```typescript
   * const result = await client.send({
   *   from: 'welcome@yourdomain.com',
   *   to: ['a@example.com', 'b@example.com'],
   *   subject: 'Hello',
   *   text: 'Hi there!',
   * });
   * ```
   */
  public async send(options: SendEmailOptions): Promise<SendEmailResultSchema> {
    let payload: SendEmailRequestSchema;
    try {
      payload = SendEmailRequestSchemaObject.parse(options);
    } catch (cause) {
      throw new CloudflareEmailError(
        'REQUEST_VALIDATION_ERROR',
        {
          reason: cause instanceof Error ? cause.message : 'validation failed',
          responseError: (cause as GuardianError | undefined)?.toJSON?.(),
        },
        cause instanceof Error ? cause : undefined,
      );
    }

    if (payload.html === undefined && payload.text === undefined) {
      throw new CloudflareEmailError('REQUEST_VALIDATION_ERROR', {
        reason: 'at least one of `html` or `text` is required',
      });
    }

    const recipients = payload.to.length + (payload.cc?.length ?? 0) +
      (payload.bcc?.length ?? 0);
    if (recipients > MAX_RECIPIENTS) {
      throw new CloudflareEmailError('REQUEST_VALIDATION_ERROR', {
        reason:
          `${recipients} recipients across to/cc/bcc exceeds Cloudflare's limit of ${MAX_RECIPIENTS}`,
      });
    }

    return await this.__requestAndValidate(
      {
        path: `/accounts/${
          encodeURIComponent(this.accountId)
        }/email/sending/send`,
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      SendEmailResultSchemaObject,
    );
  }

  /**
   * Validates the two options this connect owns beyond `RESTlerOptions`.
   * Runs only for keys actually present on the constructor argument — the
   * constructor's own `hasOption` guards cover the absent case.
   */
  protected override _processOption<K extends keyof CloudflareEmailOptions>(
    key: K,
    value: CloudflareEmailOptions[K],
  ): CloudflareEmailOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as CloudflareEmailAuth;
        if (
          !auth || auth.type !== 'BEARER' || typeof auth.token !== 'string' ||
          auth.token.trim() === ''
        ) {
          throw new CloudflareEmailError('CONFIG_INVALID_API_TOKEN');
        }
        break;
      }
      case 'accountId': {
        if (typeof value !== 'string' || value.trim() === '') {
          throw new CloudflareEmailError('CONFIG_INVALID_ACCOUNT_ID');
        }
        value = value.trim() as CloudflareEmailOptions[K];
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link CloudflareEmailError}.
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
        throw new CloudflareEmailError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler.
   *
   * Cloudflare wraps every `client/v4` response in
   * `{success, errors, messages, result}`. On success this UNWRAPS that
   * envelope and returns `result`, so each method's `responseSchema`
   * validates the payload a caller actually wants rather than the wrapper
   * (`_responseHandler` runs first and its output feeds `responseSchema`
   * — see CONVENTIONS.md's "HTTP client" section).
   *
   * A failure is classified by Cloudflare's own numeric code where one is
   * present ({@link VENDOR_CODE_MAP}), falling back to HTTP status when
   * the body isn't a recognizable envelope — which is what a gateway-level
   * 502 returning HTML looks like.
   *
   * `success: false` on a 2xx is treated as a failure too: Cloudflare's
   * envelope carries its own success flag, and trusting the status alone
   * would hand back an empty `result` as though the mail had been sent.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status ?? 0;
    const body = response.body;
    const [, envelope] = ErrorEnvelopeSchemaObject.safeParse(body);
    const failed = status >= 400 || envelope?.success === false;

    if (!failed) {
      // Unwrap the standard envelope; a body that isn't one passes through
      // untouched so `responseSchema` can report what actually arrived.
      if (body && typeof body === 'object' && 'result' in body) {
        return (body as { result: unknown }).result;
      }
      return body;
    }

    const first = envelope?.errors?.[0];
    const detail = first
      ? `${first.message} (code ${first.code})`
      : 'no detail';
    const code: CloudflareEmailErrorName = (first &&
      VENDOR_CODE_MAP[first.code]) ??
      CloudflareEmail.__statusToCode(status);

    throw new CloudflareEmailError(code, {
      status,
      detail,
      vendorCode: first?.code,
      body,
    });
  }

  /** HTTP-status fallback for a failure carrying no recognizable vendor code. */
  private static __statusToCode(status: number): CloudflareEmailErrorName {
    if (status === 401) return 'AUTH_FAILED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 413) return 'MESSAGE_TOO_LARGE';
    if (status === 429) return 'RATE_LIMITED';
    if (status === 400 || status === 422) return 'INVALID_REQUEST';
    if (status >= 500) return 'SERVICE_UNAVAILABLE';
    return 'UNKNOWN_ERROR';
  }
}
