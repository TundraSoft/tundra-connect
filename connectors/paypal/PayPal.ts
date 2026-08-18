import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
  RESTlerTimeoutError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, Guardian, GuardianError } from '@guardian';
import {
  type CreateOrderRequestSchema,
  CreateOrderRequestSchemaObject,
  ErrorEnvelopeSchemaObject,
  type OrderSchema,
  OrderSchemaObject,
  type RefundRequestSchema,
  RefundRequestSchemaObject,
  type RefundSchema,
  RefundSchemaObject,
} from './schema/mod.ts';
import { PayPalError, type PayPalErrorCode } from './errors/mod.ts';

/** Base URL for PayPal's sandbox (test) environment. */
const SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
/** Base URL for PayPal's live (production) environment. */
const LIVE_BASE_URL = 'https://api-m.paypal.com';
/**
 * How long before its documented expiry a cached access token is treated
 * as stale and re-exchanged. Keeps a request from racing a token that
 * expires mid-flight.
 */
const TOKEN_REFRESH_SKEW_SECONDS = 60;

/**
 * Guardian schema for the OAuth2 token-exchange response
 * (`POST /v1/oauth2/token`). Internal to this connect's auth handling —
 * not part of its public schema surface.
 */
const TokenResponseSchemaObject = Guardian.object({
  access_token: Guardian.string().minLength(1),
  token_type: Guardian.string().optional(),
  expires_in: Guardian.number().positive(),
  app_id: Guardian.string().optional(),
  scope: Guardian.string().optional(),
  nonce: Guardian.string().optional(),
}).passthrough();

/**
 * Maps PayPal's documented `details[].issue` values (on a 422 response) to
 * this connect's error codes. Only issue values directly confirmed
 * against PayPal's published OpenAPI spec response examples
 * (`checkout_orders_v2.json`) are listed — every other issue (or a 422
 * with no `details[].issue`) falls back to the generic `VALIDATION_ERROR`
 * code, with `issue`/`vendorMessage` preserved in context.
 */
const VENDOR_ISSUE_TO_ERROR_CODE: Record<string, PayPalErrorCode> = {
  PAYER_ACTION_REQUIRED: 'PAYER_ACTION_REQUIRED',
  ACTION_DOES_NOT_MATCH_INTENT: 'ACTION_DOES_NOT_MATCH_INTENT',
};

/**
 * PayPal authentication — an app's clientId/clientSecret, exchanged for a
 * short-lived Bearer access token via OAuth2 client-credentials
 * (`POST /v1/oauth2/token`, `Authorization: Basic base64(clientId:clientSecret)`,
 * `grant_type=client_credentials`). `environment` selects both the base
 * URL (PayPal's sandbox/live are different hosts, unlike a vendor whose
 * test/live modes share one host and differ only by key prefix) and the
 * host the token itself is exchanged against.
 */
export type PayPalAuth = {
  type: 'CUSTOM';
  /** The REST app's Client ID, from the PayPal Developer Dashboard. */
  clientId: string;
  /**
   * The REST app's Client Secret, from the PayPal Developer Dashboard.
   * Never placed into any thrown error's context by this connect.
   */
  clientSecret: string;
  /** Selects the API host — `sandbox` for testing, `live` for production. */
  environment: 'sandbox' | 'live';
};

/** Options for configuring a {@link PayPal} client. */
export type PayPalOptions = Omit<RESTlerOptions, 'auth'> & {
  /** PayPal credentials — see {@link PayPalAuth}. */
  auth: PayPalAuth;
};

/**
 * PayPal client for the [PayPal REST API](https://developer.paypal.com/api/rest/) —
 * Orders v2 (Create/Get/Capture) and the capture Refund endpoint.
 *
 * Authenticates with OAuth2 client-credentials: `clientId`/`clientSecret`
 * are exchanged for a short-lived Bearer access token (`POST
 * /v1/oauth2/token`), cached until near expiry and re-exchanged
 * automatically. Concurrent calls that all miss a cold/expired cache
 * share a single in-flight exchange rather than each starting their own
 * (see {@link __getAccessToken}).
 *
 * Scoped to the order/capture/refund lifecycle — webhook signature
 * verification and the full `payment_source` payment-method union
 * (cards, wallets, BNPL, local payment methods, ...) are out of scope for
 * this v1 connector; see {@link CreateOrderRequestSchema}'s doc comment
 * and {@link captureOrder}'s.
 *
 * @example
 * ```typescript
 * import { PayPal } from '@tundraconnect/paypal';
 *
 * const client = new PayPal({
 *   auth: {
 *     type: 'CUSTOM',
 *     clientId: 'your-client-id',
 *     clientSecret: 'your-client-secret',
 *     environment: 'sandbox',
 *   },
 * });
 *
 * const order = await client.createOrder({
 *   intent: 'CAPTURE',
 *   purchase_units: [
 *     { amount: { currency_code: 'USD', value: '10.00' } },
 *   ],
 * });
 *
 * const captured = await client.captureOrder(order.id);
 * console.log(captured.status); // 'COMPLETED'
 * ```
 */
export class PayPal extends RESTler<PayPalOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'PayPal';

  /**
   * Cached OAuth2 access tokens, populated by {@link __getAccessToken} and
   * reused until each nears expiry. Keyed by {@link __authIdentity} —
   * `_authInjector` resolves `auth` per-request (`endpoint.auth ??
   * this._getOption('auth')`, the standard RESTler per-call override
   * pattern), and an unkeyed cache would hand a token exchanged for one
   * clientId/environment to a later call resolving a *different* one.
   */
  private __tokenCache = new Map<
    string,
    { accessToken: string; expiresAt: number }
  >();

  /**
   * In-flight token-exchange promises, keyed identically to
   * {@link __tokenCache} (see {@link __authIdentity}). RESTler has no
   * request queue/serialization of its own, so N concurrent
   * {@link __getAccessToken} calls that all miss a cold/expired
   * {@link __tokenCache} entry would otherwise each independently redo the
   * network token-exchange for the very same identity. Caching the
   * in-flight `Promise` here the moment an exchange starts lets every
   * concurrent caller for that identity await the SAME exchange instead —
   * see {@link __getAccessToken}.
   */
  private __tokenExchangeInFlight = new Map<
    string,
    Promise<{ accessToken: string; expiresAt: number }>
  >();

  /** Deployment environment this client is configured for. */
  get environment(): 'sandbox' | 'live' {
    return this._getOption('auth').environment;
  }

  /**
   * Creates a new PayPal client instance.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'CUSTOM', clientId, clientSecret,
   * environment }` — see {@link PayPalAuth}.
   * @throws {PayPalError} `CONFIG_MISSING_AUTH` when `auth` is omitted;
   * `CONFIG_INVALID_AUTH_TYPE`, `CONFIG_INVALID_CLIENT_ID`,
   * `CONFIG_INVALID_CLIENT_SECRET`, or `CONFIG_INVALID_ENVIRONMENT` when
   * `auth` is malformed.
   */
  constructor(options: EventOptionKeys<PayPalOptions, RESTlerEvents>) {
    // `baseURL` depends on `auth.environment`, and RESTler's constructor
    // validates options (including the required `baseURL`) as soon as
    // `super()` runs — so `environment` must be read off the raw incoming
    // options here, before `super()`, to compute the right default
    // `baseURL` (mirrors CoinGecko's identical constructor-ordering need).
    const environment = options.auth?.environment === 'live'
      ? 'live'
      : 'sandbox';
    super(options, {
      baseURL: environment === 'live' ? LIVE_BASE_URL : SANDBOX_BASE_URL,
      timeout: 30,
      contentType: 'JSON',
    });
    // `_processOption`'s `'auth'` case (below) only runs when the caller
    // actually supplies a value for `auth` — an entirely omitted `auth`
    // would otherwise slip through construction and only surface once a
    // request tries to read `auth.clientId` off `undefined`. This mirrors
    // the explicit post-`super()` guard GCS/CoinGecko use for the same
    // reason.
    if (!this.hasOption('auth')) {
      throw new PayPalError('CONFIG_MISSING_AUTH', {});
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Create an order.
   *
   * `POST /v2/checkout/orders`.
   *
   * @param request - See {@link CreateOrderRequestSchema}.
   * @returns Promise resolving to the created {@link OrderSchema}.
   * @throws {PayPalError} `REQUEST_VALIDATION_ERROR` when `request` fails
   * local validation; otherwise a vendor-mapped code (see {@link __toError})
   * or `RESPONSE_ERROR` for a malformed success body.
   *
   * @example
   * ```typescript
   * const order = await client.createOrder({
   *   intent: 'CAPTURE',
   *   purchase_units: [
   *     { amount: { currency_code: 'USD', value: '10.00' } },
   *   ],
   * });
   * console.log(order.id, order.status); // e.g. '5O19...', 'CREATED'
   * ```
   */
  public async createOrder(
    request: CreateOrderRequestSchema,
  ): Promise<OrderSchema> {
    const payload = this.__parse(
      CreateOrderRequestSchemaObject,
      request,
    );
    return await this.__requestAndValidate(
      {
        path: '/v2/checkout/orders',
        method: 'POST',
        contentType: 'JSON',
        payload,
      },
      OrderSchemaObject,
    );
  }

  /**
   * Get an order's current state.
   *
   * `GET /v2/checkout/orders/{id}`.
   *
   * @param orderId - The PayPal order ID (`order.id` from {@link createOrder}).
   * @returns Promise resolving to {@link OrderSchema}.
   * @throws {PayPalError} `REQUEST_VALIDATION_ERROR` when `orderId` is
   * empty or contains a path-traversal segment; otherwise a vendor-mapped
   * code (see {@link __toError}) — `NOT_FOUND` for an unknown order — or
   * `RESPONSE_ERROR` for a malformed success body.
   *
   * @example
   * ```typescript
   * const order = await client.getOrder('5O190127TN364715T');
   * console.log(order.status);
   * ```
   */
  public async getOrder(orderId: string): Promise<OrderSchema> {
    this.__requireSafePathSegment(orderId, 'orderId', 'INVALID_ORDER_ID');
    return await this.__requestAndValidate(
      {
        path: `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
        method: 'GET',
      },
      OrderSchemaObject,
    );
  }

  /**
   * Capture payment for an order whose payer has approved it.
   *
   * `POST /v2/checkout/orders/{id}/capture`. Sent with an empty JSON body
   * (`{}`) — PayPal's `payment_source` capture-request override (letting a
   * caller supply payment details not already attached to the order) is
   * out of this v1 connector's scope: it is a large discriminated union
   * covering every PayPal-supported payment method (see
   * {@link CreateOrderRequestSchema}'s doc comment for the same
   * out-of-scope reasoning applied to `payment_source` on order creation).
   * A capture that needs it should be built directly against PayPal's API
   * until that's added.
   *
   * @param orderId - The PayPal order ID to capture.
   * @returns Promise resolving to the updated {@link OrderSchema} — typically
   * `status: 'COMPLETED'`, with `purchase_units[].payments.captures[]`
   * populated.
   * @throws {PayPalError} `REQUEST_VALIDATION_ERROR` when `orderId` is
   * empty or contains a path-traversal segment; `PAYER_ACTION_REQUIRED`
   * when the payer must return to PayPal first;
   * `ACTION_DOES_NOT_MATCH_INTENT` when the order's `intent` is
   * `AUTHORIZE`; otherwise a vendor-mapped code (see {@link __toError}) or
   * `RESPONSE_ERROR` for a malformed success body.
   *
   * @example
   * ```typescript
   * const captured = await client.captureOrder(order.id);
   * const capture = captured.purchase_units[0]?.payments?.captures?.[0];
   * console.log(capture?.id, capture?.status);
   * ```
   */
  public async captureOrder(orderId: string): Promise<OrderSchema> {
    this.__requireSafePathSegment(orderId, 'orderId', 'INVALID_ORDER_ID');
    return await this.__requestAndValidate(
      {
        path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        method: 'POST',
        contentType: 'JSON',
        payload: {},
      },
      OrderSchemaObject,
    );
  }

  /**
   * Refund a captured payment, in full or in part.
   *
   * `POST /v2/payments/captures/{capture_id}/refund`.
   *
   * @param captureId - The capture ID to refund (a
   * `purchase_units[].payments.captures[].id` from {@link captureOrder}).
   * @param request - See {@link RefundRequestSchema}. Omit `amount` (or
   * pass `{}`) for a full refund.
   * @returns Promise resolving to {@link RefundSchema}.
   * @throws {PayPalError} `REQUEST_VALIDATION_ERROR` when `captureId` is
   * empty/contains a path-traversal segment, or `request` fails local
   * validation; otherwise a vendor-mapped code (see {@link __toError}) or
   * `RESPONSE_ERROR` for a malformed success body.
   *
   * @example
   * ```typescript
   * // Full refund
   * await client.refundCapture(capture.id);
   *
   * // Partial refund
   * await client.refundCapture(capture.id, {
   *   amount: { currency_code: 'USD', value: '5.00' },
   *   note_to_payer: 'Partial refund for damaged item',
   * });
   * ```
   */
  public async refundCapture(
    captureId: string,
    request: RefundRequestSchema = {},
  ): Promise<RefundSchema> {
    this.__requireSafePathSegment(
      captureId,
      'captureId',
      'INVALID_CAPTURE_ID',
    );
    const payload = this.__parse(RefundRequestSchemaObject, request);
    return await this.__requestAndValidate(
      {
        path: `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
        method: 'POST',
        contentType: 'JSON',
        payload,
      },
      RefundSchemaObject,
    );
  }

  /**
   * Injects a Bearer access token for `CUSTOM` auth.
   *
   * Chains to `super()` first (preserving the base class's auth-config
   * validation, though a no-op here since {@link _processOption} already
   * enforces `auth.type === 'CUSTOM'`), then resolves a
   * cached-or-freshly-exchanged access token via {@link __getAccessToken}
   * and sets it as the request's `Authorization` header.
   *
   * @param endpoint - The per-request endpoint copy to mutate with auth headers.
   * @throws {PayPalError} `TOKEN_EXCHANGE_FAILED` when an access token
   * can't be obtained.
   * @protected
   */
  protected override async _authInjector(
    endpoint: RESTlerEndpoint,
  ): Promise<void> {
    await super._authInjector(endpoint);
    const auth = (endpoint.auth ?? this._getOption('auth')) as
      | PayPalAuth
      | undefined;
    if (!auth || auth.type !== 'CUSTOM') return;

    const token = await this.__getAccessToken(auth);
    endpoint.headers = endpoint.headers ?? {};
    endpoint.headers['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Validates the `auth` option's shape at configuration time.
   *
   * `clientId`/`clientSecret` must be non-empty strings and `environment`
   * must be `sandbox`/`live`. `clientSecret`'s *value* is never placed
   * into a thrown error's context — only whether it was supplied.
   *
   * @param key - The option key to process.
   * @param value - The option value to process.
   * @returns The processed option value.
   * @throws {PayPalError} `CONFIG_INVALID_AUTH_TYPE`,
   * `CONFIG_INVALID_CLIENT_ID`, `CONFIG_INVALID_CLIENT_SECRET`, or
   * `CONFIG_INVALID_ENVIRONMENT`.
   * @protected
   */
  protected override _processOption<K extends keyof PayPalOptions>(
    key: K,
    value: PayPalOptions[K],
  ): PayPalOptions[K] {
    if (key === 'auth' && value !== undefined && value !== null) {
      const auth = value as unknown as PayPalAuth;
      if (auth.type !== 'CUSTOM') {
        throw new PayPalError('CONFIG_INVALID_AUTH_TYPE', {
          authType: (auth as { type?: unknown }).type,
        });
      }
      if (typeof auth.clientId !== 'string' || auth.clientId.trim() === '') {
        throw new PayPalError('CONFIG_INVALID_CLIENT_ID', {});
      }
      if (
        typeof auth.clientSecret !== 'string' || auth.clientSecret.trim() === ''
      ) {
        // Never place `auth.clientSecret`'s value into this (or any)
        // error's context — only its absence/emptiness is reported.
        throw new PayPalError('CONFIG_INVALID_CLIENT_SECRET', {});
      }
      if (auth.environment !== 'sandbox' && auth.environment !== 'live') {
        throw new PayPalError('CONFIG_INVALID_ENVIRONMENT', {
          environment: auth.environment,
        });
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Resolve a valid OAuth2 access token, exchanging a fresh one only when
   * no cached token exists for `auth`'s identity (see
   * {@link __authIdentity}) or the cached one is within
   * {@link TOKEN_REFRESH_SKEW_SECONDS} of its documented expiry.
   *
   * Single-flighted per identity: when a cold/expired cache is hit, the
   * exchange is registered on {@link __tokenExchangeInFlight} *before*
   * either `await` below runs, so any other call for the same identity
   * that arrives while it's pending finds that entry and awaits the same
   * `Promise` rather than starting its own network round trip. This works
   * even when several calls happen back-to-back with no `await` between
   * them, because a synchronous function body always runs up to its first
   * genuine suspension point before any later call can observe the map —
   * so the registration is guaranteed to land before the next concurrent
   * caller's lookup. The in-flight entry is cleared once the exchange
   * settles either way: on success the resolved token is also written to
   * {@link __tokenCache} (once, from inside the exchange itself, not by
   * each awaiting caller) so a later non-concurrent call hits the cache;
   * on failure the entry is dropped so the next call retries cleanly
   * instead of a transient failure being cached forever.
   *
   * @throws {PayPalError} `TOKEN_EXCHANGE_FAILED`.
   * @private
   */
  private async __getAccessToken(auth: PayPalAuth): Promise<string> {
    const identity = this.__authIdentity(auth);
    const now = Math.floor(Date.now() / 1000);
    const cached = this.__tokenCache.get(identity);
    if (cached && cached.expiresAt - now > TOKEN_REFRESH_SKEW_SECONDS) {
      return cached.accessToken;
    }

    let exchange = this.__tokenExchangeInFlight.get(identity);
    if (!exchange) {
      exchange = (async () => {
        const token = await this.__exchangeToken(auth);
        const entry = {
          accessToken: token.access_token,
          expiresAt: now + token.expires_in,
        };
        this.__tokenCache.set(identity, entry);
        return entry;
      })();
      this.__tokenExchangeInFlight.set(identity, exchange);
      // Detached from the `await exchange` below on purpose: this only
      // clears bookkeeping and must run exactly once regardless of how
      // many callers are awaiting `exchange`, whereas every one of those
      // callers still observes the real resolution/rejection
      // independently through its own `await`. The `.catch(() => {})`
      // exists solely to keep this detached chain from surfacing as an
      // unhandled rejection — it does not swallow the error for anyone
      // else.
      exchange.catch(() => {}).finally(() => {
        if (this.__tokenExchangeInFlight.get(identity) === exchange) {
          this.__tokenExchangeInFlight.delete(identity);
        }
      });
    }

    return (await exchange).accessToken;
  }

  /**
   * Derive a {@link __tokenCache} key identifying which credentials (and
   * environment) a token was exchanged for, so a token cached for one
   * `clientId`/`environment` is never handed to a caller resolving a
   * different one. `environment` is included because sandbox and live are
   * different hosts with independent tokens even for the same
   * `clientId`/`clientSecret` pair (which in practice never happens, since
   * PayPal issues distinct credentials per environment — but the cache
   * key doesn't rely on that).
   *
   * Encoded with `JSON.stringify` (not simple concatenation) so a
   * `clientId`/`clientSecret` value that happens to contain whatever
   * separator was chosen can't collide two distinct identities onto the
   * same key. This is a plain in-memory `Map` key — held only for this
   * client instance's lifetime, never logged or serialised — not a
   * cryptographic fingerprint, so no hashing is needed for that purpose.
   *
   * @private
   */
  private __authIdentity(auth: PayPalAuth): string {
    return JSON.stringify([auth.clientId, auth.clientSecret, auth.environment]);
  }

  /**
   * Exchange `clientId`/`clientSecret` for an OAuth2 access token.
   *
   * `POST {environment host}/v1/oauth2/token`, `Authorization: Basic
   * base64(clientId:clientSecret)` (HTTP Basic — but only for this ONE
   * call, not this connect's general `auth` type), body
   * `grant_type=client_credentials` as `application/x-www-form-urlencoded`.
   *
   * Goes through `this._makeRequest` like every other request this client
   * makes, via `options.skipAuth: true` — the one thing this connect's own
   * token-fetch needs, since calling `_makeRequest` from inside
   * {@link _authInjector} without it would recurse back into
   * `_authInjector` again before the token exists.
   *
   * The vendor-wide {@link _responseHandler} (`__toError`, set in the
   * constructor) is deliberately NOT used for this call — it maps the
   * Orders/Payments API's `{ name, message, debug_id, details }` envelope,
   * but the OAuth2 token endpoint sends its own, differently-shaped error
   * body (`{ error: 'invalid_client', error_description }`) and this
   * method's contract is to always throw `TOKEN_EXCHANGE_FAILED`
   * regardless. A per-call `responseHandler` below overrides the default
   * for this one request and does that status check itself;
   * `responseSchema` validates the token shape on a successful response.
   *
   * @throws {PayPalError} `TOKEN_EXCHANGE_FAILED` when the request fails
   * (including timing out), the endpoint responds with a non-2xx status,
   * or the response body doesn't match the documented token shape.
   * @private
   */
  private async __exchangeToken(
    auth: PayPalAuth,
  ): Promise<{ access_token: string; expires_in: number }> {
    const baseURL = auth.environment === 'live'
      ? LIVE_BASE_URL
      : SANDBOX_BASE_URL;
    const payload = new URLSearchParams({ grant_type: 'client_credentials' });

    // Captured by `responseHandler` below so a `responseSchema` validation
    // failure can still report the status/body that failed to validate —
    // `RESTlerResponseValidationError`'s own metadata carries only the
    // request, not the response.
    let status: number | null = null;
    let body: unknown;

    try {
      const response = await this._makeRequest(
        {
          baseURL,
          path: '/v1/oauth2/token',
          method: 'POST',
          contentType: 'FORM',
          payload,
          headers: {
            // Basic-auth-encode the credentials for THIS call only —
            // never as this connect's general `auth` type. `_base64Utf8`
            // is RESTler's own UTF-8-correct base64 helper (protected, so
            // available to a subclass) — reused here rather than
            // reimplemented.
            Authorization: `Basic ${
              this._base64Utf8(`${auth.clientId}:${auth.clientSecret}`)
            }`,
          },
        },
        {
          skipAuth: true,
          responseHandler: (resp) => {
            status = resp.status;
            body = resp.body;
            if (status === null || status < 200 || status >= 300) {
              throw new PayPalError('TOKEN_EXCHANGE_FAILED', { status, body });
            }
            return resp.body;
          },
          responseSchema: (data) => TokenResponseSchemaObject.parse(data),
        },
      );
      // `RESTlerResponse.body` is typed optional (`body?: T`) generically —
      // `responseSchema` above already guarantees it's set and matches
      // `TokenResponseSchemaObject`'s shape whenever this line is reached.
      return response.body as { access_token: string; expires_in: number };
    } catch (cause) {
      // Already shaped by `responseHandler` above — surface unchanged.
      if (cause instanceof PayPalError) {
        throw cause;
      }
      if (cause instanceof RESTlerTimeoutError) {
        throw new PayPalError('TOKEN_EXCHANGE_FAILED', {
          status,
          reason: 'timeout',
        }, cause);
      }
      if (cause instanceof RESTlerResponseValidationError) {
        throw new PayPalError('TOKEN_EXCHANGE_FAILED', {
          status,
          body,
          responseError: cause.cause instanceof GuardianError
            ? cause.cause.toJSON()
            : undefined,
        }, cause);
      }
      throw new PayPalError('TOKEN_EXCHANGE_FAILED', {
        status,
        reason: 'request failed',
      }, cause instanceof Error ? cause : undefined);
    }
  }

  /**
   * Parse `value` against `guard`, unwrapping a {@link GuardianError} into
   * a {@link PayPalError} — the local-validation counterpart to
   * {@link __requestAndValidate} (which handles a RESPONSE that fails
   * validation; this handles a REQUEST that does, before any request is
   * sent).
   *
   * @throws {PayPalError} `REQUEST_VALIDATION_ERROR`.
   * @private
   */
  private __parse<B>(guard: BaseGuardian<B>, value: unknown): B {
    try {
      return guard.parse(value);
    } catch (cause) {
      throw new PayPalError('REQUEST_VALIDATION_ERROR', {
        reason: cause instanceof GuardianError
          ? cause.message
          : 'validation failed',
        responseError: cause instanceof GuardianError
          ? cause.toJSON()
          : undefined,
      }, cause instanceof GuardianError ? cause : undefined);
    }
  }

  /**
   * Guards a required path-segment string (an order or capture ID) before
   * it's used to build a request path — rejects `undefined`/non-string
   * values, an empty or whitespace-only string, and any `/`-delimited `.`
   * or `..` segment.
   *
   * `encodeURIComponent` (used when building the actual request path)
   * leaves a literal `.`/`..` *segment* unchanged — dots aren't
   * URI-reserved — and RESTler's `_processEndpoint` resolves the final
   * path with `path.join(url.pathname, endpoint.path)`, the same
   * collapsing a filesystem path does. So an unvalidated `orderId: '..'`
   * on `GET /v2/checkout/orders/{id}` would resolve to
   * `/v2/checkout/orders`, a different (list-shaped, here 404/405)
   * endpoint than the one the caller intended — mirroring the identical
   * path-traversal hazard already fixed in this repository's GCS connect
   * for its `bucket`/`key` parameters.
   *
   * @throws {PayPalError} `code` (`INVALID_ORDER_ID`/`INVALID_CAPTURE_ID`)
   * when `value` is missing/blank/whitespace-only or contains a `.`/`..`
   * segment.
   * @private
   */
  private __requireSafePathSegment(
    value: string,
    field: 'orderId' | 'captureId',
    code: 'INVALID_ORDER_ID' | 'INVALID_CAPTURE_ID',
  ): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new PayPalError(code, { field, value });
    }
    const segments = value.split('/');
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw new PayPalError(code, { field, value });
    }
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link PayPalError} — see CONVENTIONS.md's "HTTP client"
   * section for the full rationale.
   *
   * @template B - The expected response body type.
   * @param endpoint - The endpoint to request.
   * @param guard - Guardian schema object for validating the response.
   * @returns The validated response data.
   * @throws {PayPalError} `RESPONSE_ERROR` when the body fails
   * validation.
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
        throw new PayPalError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler — translates PayPal's documented
   * `{ name, message, debug_id, details, links }` error envelope into a
   * {@link PayPalError}. Runs on every response (registered on
   * `_responseHandler` in the constructor); does nothing for a response
   * below 400, leaving success-body validation to
   * {@link __requestAndValidate}.
   *
   * For a 422, `details[0].issue` is checked against
   * {@link VENDOR_ISSUE_TO_ERROR_CODE} first; every other status (or an
   * unmapped issue) falls back to {@link __statusToErrorCode}.
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {PayPalError} A vendor-mapped or status-mapped code.
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    const [envelopeErr, envelope] = ErrorEnvelopeSchemaObject.safeParse(
      response.body,
    );

    const context: Record<string, unknown> = { status, body: response.body };
    let issue: string | undefined;
    if (!envelopeErr && envelope) {
      context.vendorName = envelope.name;
      context.vendorMessage = envelope.message;
      context.debugId = envelope.debug_id;
      context.details = envelope.details;
      issue = envelope.details?.[0]?.issue;
      if (issue !== undefined) context.issue = issue;
    }

    const mapped = issue ? VENDOR_ISSUE_TO_ERROR_CODE[issue] : undefined;
    throw new PayPalError(mapped ?? this.__statusToErrorCode(status), context);
  }

  /** Fallback status-code-only mapping, used when no issue-specific code applies. */
  private __statusToErrorCode(status: number): PayPalErrorCode {
    switch (status) {
      case 400:
        return 'INVALID_REQUEST';
      case 401:
        return 'AUTH_FAILED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 415:
        return 'UNSUPPORTED_MEDIA_TYPE';
      case 422:
        return 'VALIDATION_ERROR';
      case 429:
        return 'RATE_LIMITED';
      default:
        return status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN_ERROR';
    }
  }
}
