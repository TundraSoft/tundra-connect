import {
  RESTler,
  type RESTlerAuth,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerRateLimitError,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { constantTimeEqual, signHMAC } from '@crypt';
import { ulid } from '@id';
import {
  type CreateCustomerRequestSchema,
  CreateCustomerRequestSchemaObject,
  type CreatePaymentIntentRequestSchema,
  CreatePaymentIntentRequestSchemaObject,
  type CustomerSchema,
  CustomerSchemaObject,
  ErrorSchemaObject,
  paymentIntentIdGuard,
  type PaymentIntentSchema,
  PaymentIntentSchemaObject,
  secretKeyGuard,
} from './schema/mod.ts';
import { StripeError, type StripeErrorCode } from './errors/mod.ts';
import { type BaseGuardian, GuardianError } from '@guardian';

/**
 * Maps Stripe's documented `error.code` values
 * (https://docs.stripe.com/error-codes) to this connect's error codes.
 * Checked before the {@link STATUS_ERROR_CODE_MAP} fallback — a `code` is
 * more specific than the HTTP status alone (e.g. every declined card is a
 * 402, but `card_declined` vs `expired_card` vs `incorrect_cvc` matter to
 * the caller).
 */
const VENDOR_ERROR_CODE_MAP: Record<string, StripeErrorCode> = {
  card_declined: 'CARD_DECLINED',
  resource_missing: 'RESOURCE_MISSING',
  parameter_missing: 'PARAMETER_MISSING',
  parameter_invalid_empty: 'PARAMETER_INVALID_EMPTY',
  expired_card: 'EXPIRED_CARD',
  incorrect_cvc: 'INCORRECT_CVC',
  incorrect_number: 'INCORRECT_NUMBER',
  processing_error: 'PROCESSING_ERROR',
  rate_limit: 'RATE_LIMITED',
  api_key_expired: 'API_KEY_EXPIRED',
  authentication_required: 'AUTHENTICATION_REQUIRED',
};

/**
 * Fallback mapping from HTTP status to this connect's error codes, used
 * when the response's `error.code` (if any) isn't one of the specific
 * codes in {@link VENDOR_ERROR_CODE_MAP} above. Stripe's `error.type` is
 * deliberately not used for this dispatch — it's too coarse (every card
 * failure is `card_error` regardless of cause) — the HTTP status is the
 * more reliable primary signal.
 */
const STATUS_ERROR_CODE_MAP: Record<number, StripeErrorCode> = {
  400: 'INVALID_REQUEST_ERROR',
  401: 'AUTHENTICATION_ERROR',
  402: 'CARD_ERROR',
  403: 'PERMISSION_ERROR',
  404: 'RESOURCE_MISSING',
  409: 'IDEMPOTENCY_ERROR',
  429: 'RATE_LIMITED',
};

/**
 * Recursively flattens `value` into Stripe's bracket-notation
 * `application/x-www-form-urlencoded` pairs and appends them to `out`.
 *
 * Nested objects flatten as `parent[child]=value` and arrays as explicit
 * `key[0]=`, `key[1]=`, ... indices — both recursively, so an array of
 * objects or an object of arrays flattens correctly too. Booleans
 * serialize as the literal strings `'true'`/`'false'`; `undefined`/`null`
 * are skipped entirely (Stripe treats an included-but-empty value
 * differently from an omitted one for some parameters, so silently
 * coercing one into the other would change request semantics). A
 * genuinely-empty array (`[]`) is likewise omitted entirely — this
 * connect has no update-style endpoint where sending a "clear this
 * list" signal is ever needed (`createPaymentIntent`/`createCustomer`
 * are both create-only), and a bare unbracketed `key=` for an
 * array-typed field is indistinguishable from setting a plain scalar
 * field to an empty string on Stripe's Rack-style nested-parameter
 * parser, so omission is the only unambiguous choice here.
 *
 * Not exported — Stripe's bracket-notation flattening is business logic
 * specific to this connect's request encoding, not a general-purpose
 * utility.
 */
function flattenFormParams(
  value: unknown,
  key: string,
  out: string[],
): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return;
    }
    value.forEach((item, index) => {
      flattenFormParams(item, `${key}[${index}]`, out);
    });
    return;
  }
  if (typeof value === 'boolean') {
    out.push(`${encodeURIComponent(key)}=${value ? 'true' : 'false'}`);
    return;
  }
  if (typeof value === 'object') {
    for (
      const [childKey, childValue] of Object.entries(
        value as Record<string, unknown>,
      )
    ) {
      flattenFormParams(childValue, `${key}[${childKey}]`, out);
    }
    return;
  }
  out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
}

/**
 * Serializes a plain object into Stripe's required
 * `application/x-www-form-urlencoded` wire format, using bracket notation
 * for nested objects/arrays.
 *
 * RESTler's built-in `contentType: 'FORM'` (see `_buildBody`'s `'FORM'`
 * branch in `@restler`'s `RESTler.ts`) builds a real `FormData` and lets
 * `fetch` send it as `multipart/form-data` with an auto-generated
 * boundary — the wrong wire format for Stripe, which only documents
 * `application/x-www-form-urlencoded` bodies. So every write endpoint in
 * this connect instead sends the result of this function as a `'TEXT'`
 * payload with an explicit `Content-Type` header (see
 * {@link Stripe.createPaymentIntent} / {@link Stripe.createCustomer}).
 */
function toFormUrlEncoded(payload: Record<string, unknown>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    flattenFormParams(value, key, pairs);
  }
  return pairs.join('&');
}

/** Options for configuring a {@link Stripe} client. */
export type StripeOptions = Omit<RESTlerOptions, 'auth'> & {
  /**
   * Stripe secret or restricted API key, modeled as this repository's
   * standard `auth: RESTlerAuth` option — always
   * `{ type: 'BASIC', username: <sk_/rk_ key>, password: '' }`. Stripe's
   * primary documented scheme (see the class doc below) is HTTP Basic Auth
   * with the secret key as the username and no password, so `username`
   * carries the key (`sk_test_...`, `sk_live_...`, `rk_test_...`, or
   * `rk_live_...`) and `password` is always the empty string.
   */
  auth: RESTlerAuth;
};

/**
 * Stripe client for the Stripe REST API — PaymentIntent create/retrieve
 * and Customer create.
 *
 * ### Authentication
 * Stripe's primary documented scheme
 * (https://docs.stripe.com/api/authentication) is HTTP Basic Auth: the
 * secret key as the username, with no password (`Authorization: Basic
 * base64(sk_live_xxx:)`). `Authorization: Bearer <key>` is documented only
 * as an alternative for cross-origin requests, which doesn't apply to this
 * server-side connect, so `BASIC` is used here. RESTler v1.1.3's
 * `_validateAuth` accepts an empty `password` for `BASIC` (RFC 7617
 * permits it — earlier RESTler versions required a non-empty password,
 * which is why this class used to send `BEARER` instead), and — like
 * `BEARER` — `BASIC` is handled entirely by the base `_authInjector`, so
 * this class still never overrides it.
 *
 * ### Request encoding
 * Every write endpoint sends `application/x-www-form-urlencoded`, using
 * Stripe's bracket notation for nested objects/arrays (`metadata[foo]=bar`,
 * `items[0][price]=x`). See {@link toFormUrlEncoded} for why RESTler's
 * built-in `'FORM'` content type isn't used for this.
 *
 * @example
 * ```typescript
 * import { Stripe } from '@tundraconnect/stripe';
 *
 * const client = new Stripe({
 *   auth: { type: 'BASIC', username: 'sk_test_...', password: '' },
 * });
 *
 * const intent = await client.createPaymentIntent({
 *   amount: 1999,
 *   currency: 'usd',
 *   automatic_payment_methods: { enabled: true },
 * });
 *
 * const retrieved = await client.retrievePaymentIntent(intent.id);
 *
 * const customer = await client.createCustomer({ email: 'jenny@example.com' });
 * ```
 */
/**
 * Per-request idempotency control for the create/mutate calls.
 *
 * Supply the SAME `idempotencyKey` on every retry of one logical operation
 * and the vendor returns the original result instead of performing it
 * again — the standard defence against a double charge when a request
 * times out after the vendor already acted on it. Generate one with
 * {@link Stripe.newIdempotencyKey} and persist it alongside your own order
 * record BEFORE the first attempt, so a crash between attempts cannot lose
 * it.
 *
 * Deliberately opt-in: auto-generating a fresh key per call would be
 * indistinguishable from sending none, and silently generating one per
 * *retry* would defeat the point.
 */
export type IdempotentRequestOptions = {
  /** Stable, caller-owned key for this logical operation. */
  idempotencyKey?: string;
};

/**
 * Anything a runtime hands you as request headers — a `Headers` instance or
 * a plain object. Lookup is case-insensitive either way, as HTTP header
 * names are.
 */
export type WebhookHeadersLike =
  | Headers
  | Record<string, string | string[] | undefined>;

/** Arguments to {@link Stripe.verifyWebhook}. */
export type VerifyWebhookOptions = {
  /** The RAW request body, exactly as received (`await req.text()`), never re-serialized. */
  payload: string;
  headers: WebhookHeadersLike;
  /** The endpoint's signing secret from the dashboard (`whsec_…`), used as-is. */
  secret: string;
  /** Replay window in seconds. @default 300 */
  toleranceSeconds?: number;
  /** Clock override, for tests. */
  nowMs?: number;
};

export class Stripe extends RESTler<StripeOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Stripe';

  /**
   * Creates a new Stripe client instance
   *
   * `auth` is required — `EventOptionKeys` makes it optional at the
   * constructor's type level (every option is), so an omitted `auth` is
   * caught here rather than surfacing as an opaque auth failure on the
   * first request.
   *
   * @param options - Configuration options for the client
   * @param options.auth - `{ type: 'BASIC', username: <secret key>,
   * password: '' }` — see {@link StripeOptions.auth}.
   * @throws {StripeError} `CONFIG_INVALID_SECRET_KEY` when `auth` is
   * missing, isn't `type: 'BASIC'`, or `auth.username` is empty or doesn't
   * start with `sk_`/`rk_`.
   */
  constructor(options: EventOptionKeys<StripeOptions, RESTlerEvents>) {
    super(options, {
      baseURL: 'https://api.stripe.com/v1',
      timeout: 30,
      contentType: 'TEXT',
    });
    if (!this._hasOption('auth')) {
      throw new StripeError('CONFIG_INVALID_SECRET_KEY', {});
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Create a PaymentIntent
   *
   * `POST /payment_intents`
   *
   * @param params - PaymentIntent creation options; see
   * {@link CreatePaymentIntentRequestSchema}. `amount` and `currency` are
   * required.
   * @returns Promise resolving to {@link PaymentIntentSchema}.
   * @throws {StripeError} `INVALID_REQUEST` when `params` fails local
   * validation; a vendor-mapped code (see {@link Stripe}'s class doc),
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * const intent = await client.createPaymentIntent({
   *   amount: 1999,
   *   currency: 'usd',
   *   automatic_payment_methods: { enabled: true },
   * });
   * console.log(intent.id, intent.client_secret);
   * ```
   */
  public async createPaymentIntent(
    params: CreatePaymentIntentRequestSchema,
    options: IdempotentRequestOptions = {},
  ): Promise<PaymentIntentSchema> {
    const [error, parsed] = CreatePaymentIntentRequestSchemaObject.safeParse(
      params,
    );
    if (error || !parsed) {
      throw new StripeError('INVALID_REQUEST', {
        reason: error?.message ?? 'validation failed',
        responseError: (error as GuardianError | null)?.toJSON(),
      });
    }

    return await this.__requestAndValidate(
      {
        path: '/payment_intents',
        method: 'POST',
        contentType: 'TEXT',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...Stripe.__idempotencyHeader(options),
        },
        payload: toFormUrlEncoded(parsed),
      },
      PaymentIntentSchemaObject,
    );
  }

  /**
   * Retrieve a PaymentIntent by id
   *
   * `GET /payment_intents/{id}`
   *
   * @param id - PaymentIntent id (`pi_...`).
   * @returns Promise resolving to {@link PaymentIntentSchema}.
   * @throws {StripeError} `INVALID_REQUEST` when `id` doesn't look like a
   * PaymentIntent id; a vendor-mapped code (see {@link Stripe}'s class
   * doc), `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected
   * or malformed response.
   *
   * @example
   * ```typescript
   * const intent = await client.retrievePaymentIntent('pi_3Nx0aB2c3D4e5F6g');
   * console.log(intent.status);
   * ```
   */
  public async retrievePaymentIntent(id: string): Promise<PaymentIntentSchema> {
    const [error, parsedId] = paymentIntentIdGuard.safeParse(id);
    if (error || !parsedId) {
      throw new StripeError('INVALID_REQUEST', {
        reason: error?.message ?? `'${id}' is not a valid PaymentIntent id`,
        responseError: (error as GuardianError | null)?.toJSON(),
      });
    }

    return await this.__requestAndValidate(
      {
        path: `/payment_intents/${encodeURIComponent(parsedId)}`,
        method: 'GET',
      },
      PaymentIntentSchemaObject,
    );
  }

  /**
   * Create a Customer
   *
   * `POST /customers`
   *
   * @param params - Customer creation options; see
   * {@link CreateCustomerRequestSchema}. No field is universally required.
   * @returns Promise resolving to {@link CustomerSchema}.
   * @throws {StripeError} `INVALID_REQUEST` when `params` fails local
   * validation; a vendor-mapped code (see {@link Stripe}'s class doc),
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * const customer = await client.createCustomer({
   *   email: 'jenny@example.com',
   *   name: 'Jenny Rosen',
   * });
   * console.log(customer.id);
   * ```
   */
  public async createCustomer(
    params: CreateCustomerRequestSchema = {},
    options: IdempotentRequestOptions = {},
  ): Promise<CustomerSchema> {
    const [error, parsed] = CreateCustomerRequestSchemaObject.safeParse(
      params,
    );
    if (error || !parsed) {
      throw new StripeError('INVALID_REQUEST', {
        reason: error?.message ?? 'validation failed',
        responseError: (error as GuardianError | null)?.toJSON(),
      });
    }

    return await this.__requestAndValidate(
      {
        path: '/customers',
        method: 'POST',
        contentType: 'TEXT',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...Stripe.__idempotencyHeader(options),
        },
        payload: toFormUrlEncoded(parsed),
      },
      CustomerSchemaObject,
    );
  }

  /**
   * Validates the `auth` option's `username`, reusing {@link secretKeyGuard}
   * so the config-time check and the schema exported for advanced usage
   * (`@tundraconnect/stripe/schemas`) share one pattern definition rather
   * than drifting apart. Only the documented prefix/mode structure is
   * pinned (`sk_`/`rk_` + `test_`/`live_`) — Stripe doesn't publish a fixed
   * length or character set for the key body, and it has grown over the
   * years (e.g. newer `sk_test_51...` keys), so a stricter pattern would
   * risk rejecting a legitimately-issued key.
   *
   * Anything other than `{ type: 'BASIC', username: <sk_/rk_ key>, ... }`
   * — a missing `auth`, a non-`BASIC` type, or a `username` that isn't a
   * validly-shaped secret key — is rejected here with the same
   * `CONFIG_INVALID_SECRET_KEY` code, since `BASIC` is the only auth shape
   * this connect ever accepts.
   *
   * @param key - The option key to process
   * @param value - The option value to process
   * @returns The processed option value
   * @throws {StripeError} `CONFIG_INVALID_SECRET_KEY` when `auth` is
   * malformed
   * @protected
   */
  protected override _processOption<K extends keyof StripeOptions>(
    key: K,
    value: StripeOptions[K],
  ): StripeOptions[K] {
    if (key === 'auth') {
      const auth = value as unknown as RESTlerAuth | undefined;
      const username = auth?.type === 'BASIC' ? auth.username : undefined;
      const [error] = secretKeyGuard.safeParse(username);
      if (error) {
        // Never echo the raw `value` here (as a message placeholder or as
        // context) — it's a live Stripe secret key, and `context` is
        // stored on the thrown error verbatim (see `StripeError.toJSON`),
        // so anything placed here is just as exposed as the message text.
        throw new StripeError('CONFIG_INVALID_SECRET_KEY', {});
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link StripeError} — so `StripeError` stays the only thing a
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
   * @throws {StripeError} `RESPONSE_ERROR` when the body fails validation
   *
   * @private
   */
  /**
   * A fresh idempotency key — a ULID: 26 chars, time-sortable, URL-safe,
   * well inside Stripe's 255-character limit. Generated by
   * `@tundralibs/id`, never by hand.
   *
   * @example
   * ```typescript
   * const key = Stripe.newIdempotencyKey();
   * await db.orders.update(id, { stripeIdempotencyKey: key }); // persist FIRST
   * await client.createPaymentIntent(params, { idempotencyKey: key });
   * ```
   */
  public static newIdempotencyKey(): string {
    return ulid();
  }

  /** The `Idempotency-Key` header for `options`, or nothing when no key was given. */
  private static __idempotencyHeader(
    options: IdempotentRequestOptions,
  ): Record<string, string> {
    return options.idempotencyKey
      ? { 'Idempotency-Key': options.idempotencyKey }
      : {};
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
   * Verifies a Stripe webhook's `Stripe-Signature` and returns the PARSED
   * event.
   *
   * Stripe's scheme: the header is `t=<ts>,v1=<hex>[,v1=<hex>…]`; the
   * signed string is `<ts>.<rawBody>`; HMAC-SHA256 with the `whsec_…`
   * secret used as the UTF-8 key **as-is** (not decoded — unlike Standard
   * Webhooks); hex output. Every `v1` is checked (a rolling secret yields
   * two); any non-`v1` scheme is ignored to prevent downgrade. Comparison
   * is constant-time via `@tundralibs/crypt`.
   *
   * @throws {StripeError} `WEBHOOK_INVALID_HEADERS`, `WEBHOOK_TIMESTAMP_INVALID`,
   * `WEBHOOK_SIGNATURE_INVALID`, or `RESPONSE_ERROR` when the verified
   * payload is not JSON.
   *
   * @example
   * ```typescript
   * const raw = await req.text(); // text(), never json()
   * const event = await client.verifyWebhook({
   *   payload: raw,
   *   headers: req.headers,
   *   secret: WEBHOOK_SIGNING_SECRET,
   * });
   * ```
   */
  public async verifyWebhook(options: VerifyWebhookOptions): Promise<unknown> {
    const {
      payload,
      headers,
      secret,
      toleranceSeconds = 300,
      nowMs = Date.now(),
    } = options;
    const header = Stripe.__webhookHeader(headers, 'stripe-signature');
    if (!header) {
      throw new StripeError('WEBHOOK_INVALID_HEADERS', {
        reason: 'missing Stripe-Signature',
      });
    }
    let timestamp: string | undefined;
    const signatures: string[] = [];
    for (const part of header.split(',')) {
      const i = part.indexOf('=');
      if (i === -1) continue;
      const key = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      if (key === 't') timestamp = value;
      else if (key === 'v1') signatures.push(value);
    }
    if (!timestamp || signatures.length === 0) {
      throw new StripeError('WEBHOOK_INVALID_HEADERS', {
        reason: 'Stripe-Signature carries no t= and v1= pair',
      });
    }
    const sentAtSec = Number(timestamp);
    if (!Number.isFinite(sentAtSec)) {
      throw new StripeError('WEBHOOK_TIMESTAMP_INVALID', {
        reason: `'${timestamp}' is not a Unix timestamp in seconds`,
      });
    }
    // Both directions: a forged far-future timestamp would otherwise be
    // replayable forever.
    const driftSec = Math.abs(nowMs / 1000 - sentAtSec);
    if (driftSec > toleranceSeconds) {
      throw new StripeError('WEBHOOK_TIMESTAMP_INVALID', {
        reason: `${
          Math.round(driftSec)
        }s drift exceeds the ${toleranceSeconds}s tolerance`,
      });
    }
    const expected = await signHMAC(`${timestamp}.${payload}`, secret);
    let matched = false;
    for (const candidate of signatures) {
      if (constantTimeEqual(candidate, expected)) matched = true;
    }
    if (!matched) throw new StripeError('WEBHOOK_SIGNATURE_INVALID', {});
    try {
      return JSON.parse(payload);
    } catch (cause) {
      throw new StripeError(
        'RESPONSE_ERROR',
        {},
        cause instanceof Error ? cause : undefined,
      );
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
        throw new StripeError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      if (err instanceof RESTlerRateLimitError) {
        // RESTler retried once (maxRetryWait) and was throttled again, or the
        // vendor's hint exceeded the cap — surface it as this connect's own
        // error, with the hint and whether a wait already happened.
        throw new StripeError('RATE_LIMITED', {
          status: 429,
          retryAfterSeconds: err.getContextValue('retryAfter'),
          retried: err.getContextValue('retried'),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates Stripe's
   * documented error envelope into a {@link StripeError}. Runs on every
   * response (registered on `_responseHandler` in the constructor): an
   * error body is parsed as Stripe's `{ error: {...} }` envelope, and its
   * documented `code` — when present and recognised — is mapped to a
   * specific {@link StripeError} via {@link VENDOR_ERROR_CODE_MAP};
   * otherwise the HTTP status is mapped via {@link STATUS_ERROR_CODE_MAP}.
   * Anything else (5xx, or an unparseable error body) surfaces as
   * `SERVICE_UNAVAILABLE`/`RESPONSE_ERROR`. Does nothing for a successful
   * response, leaving body validation to {@link __requestAndValidate}.
   *
   * @param response - The parsed response, before any schema validation
   * @throws {StripeError} A vendor-mapped code, `RESPONSE_ERROR`, or
   * `SERVICE_UNAVAILABLE`, matching the vendor's documented status/code
   * pairs.
   *
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status !== null && status < 400) {
      return response.body;
    }

    const [envelopeErr, envelope] = ErrorSchemaObject.safeParse(
      response.body,
    );
    if (envelopeErr || !envelope) {
      if (status !== null && status >= 500) {
        throw new StripeError('SERVICE_UNAVAILABLE', {
          status,
          body: response.body,
        });
      }
      throw new StripeError('RESPONSE_ERROR', {
        status,
        body: response.body,
        responseError: (envelopeErr as GuardianError | null)?.toJSON(),
      });
    }

    const detail = envelope.error;
    const meta = {
      status,
      retryAfterSeconds: this._parseRetryAfter(response.headers),
      vendorType: detail.type,
      vendorCode: detail.code,
      // `message` is optional in the vendor envelope; several templates
      // interpolate ${vendorMessage}, so fall back to a meaningful default.
      vendorMessage: detail.message ?? 'no further details provided by Stripe',
      param: detail.param,
      declineCode: detail.decline_code,
      docUrl: detail.doc_url,
    };

    const byCode = detail.code !== undefined
      ? VENDOR_ERROR_CODE_MAP[detail.code]
      : undefined;
    if (byCode) {
      throw new StripeError(byCode, meta);
    }

    const byStatus = status !== null
      ? STATUS_ERROR_CODE_MAP[status]
      : undefined;
    if (byStatus) {
      throw new StripeError(byStatus, meta);
    }

    if (status !== null && status >= 500) {
      throw new StripeError('SERVICE_UNAVAILABLE', meta);
    }
    throw new StripeError('RESPONSE_ERROR', meta);
  }
}
