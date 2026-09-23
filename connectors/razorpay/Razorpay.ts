import {
  RESTler,
  type RESTlerAuth,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, GuardianError } from '@guardian';
import {
  type CapturePaymentRequestSchema,
  CapturePaymentRequestSchemaObject,
  type CreateOrderRequestSchema,
  CreateOrderRequestSchemaObject,
  type CreatePaymentLinkRequestSchema,
  CreatePaymentLinkRequestSchemaObject,
  keyIdGuard,
  type ListPaymentsRequestSchema,
  ListPaymentsRequestSchemaObject,
  type ListPaymentsResponseSchema,
  ListPaymentsResponseSchemaObject,
  orderIdGuard,
  type OrderSchema,
  OrderSchemaObject,
  paymentIdGuard,
  type PaymentLinkSchema,
  PaymentLinkSchemaObject,
  type PaymentSchema,
  PaymentSchemaObject,
  RazorpayErrorEnvelopeSchemaObject,
} from './schema/mod.ts';
import { RazorpayError, type RazorpayErrorCode } from './errors/mod.ts';

/**
 * Maps Razorpay's documented top-level `error.code` values
 * (https://razorpay.com/docs/errors/x/) to this connect's error codes.
 * Checked before the {@link STATUS_ERROR_CODE_MAP} fallback — a `code` is
 * more specific than the HTTP status alone.
 */
const VENDOR_ERROR_CODE_MAP: Record<string, RazorpayErrorCode> = {
  BAD_REQUEST_ERROR: 'BAD_REQUEST_ERROR',
  GATEWAY_ERROR: 'GATEWAY_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
};

/**
 * Fallback mapping from HTTP status to this connect's error codes, used
 * when the response's `error.code` isn't one of the values in
 * {@link VENDOR_ERROR_CODE_MAP} above (or the envelope failed to parse).
 */
const STATUS_ERROR_CODE_MAP: Record<number, RazorpayErrorCode> = {
  400: 'BAD_REQUEST_ERROR',
  401: 'BAD_REQUEST_ERROR',
  404: 'BAD_REQUEST_ERROR',
  502: 'GATEWAY_ERROR',
  500: 'SERVER_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

/** Options for configuring a {@link Razorpay} client. */
export type RazorpayOptions = Omit<RESTlerOptions, 'auth'> & {
  /**
   * Razorpay `key_id` / `key_secret` pair, modeled as this repository's
   * standard `auth: RESTlerAuth` option — always `{ type: 'BASIC',
   * username: <key_id>, password: <key_secret> }`. Razorpay's documented
   * scheme (https://razorpay.com/docs/api/authentication/) is HTTP Basic
   * Auth with the key id as the username and the key secret as the
   * password, so this connect models it exactly that way.
   */
  auth: RESTlerAuth;
};

/**
 * Razorpay client for the Razorpay REST API — Orders, Payments, and
 * Payment Links.
 *
 * ### Authentication
 * Razorpay's documented scheme
 * (https://razorpay.com/docs/api/authentication/) is HTTP Basic Auth: the
 * `key_id` as the username, the `key_secret` as the password
 * (`Authorization: Basic base64(key_id:key_secret)`). RESTler's base
 * `_authInjector` already emits this header for `BASIC` auth, so this
 * class never overrides it.
 *
 * ### Test vs live mode
 * Unlike some vendors, Razorpay has no separate sandbox host — test-mode
 * keys (`rzp_test_...`) and live-mode keys (`rzp_live_...`) both hit the
 * identical `https://api.razorpay.com/v1` base URL; the key itself
 * determines the mode. No environment/mode option is needed.
 *
 * ### Amounts
 * Every `amount` field — on requests and responses alike — is in the
 * smallest unit of the currency (paise for INR, cents for USD, ...), and
 * is always a positive integer. ₹299.00 is sent as `29900`, never `299`
 * or `299.00`. See {@link amountGuard}.
 *
 * @example
 * ```typescript
 * import { Razorpay } from '@tundraconnect/razorpay';
 *
 * const client = new Razorpay({
 *   auth: { type: 'BASIC', username: 'rzp_test_...', password: '...' },
 * });
 *
 * const order = await client.createOrder({ amount: 29900, currency: 'INR' });
 *
 * const fetched = await client.getOrder(order.id);
 *
 * const payment = await client.capturePayment('pay_...', {
 *   amount: 29900,
 *   currency: 'INR',
 * });
 *
 * const link = await client.createPaymentLink({
 *   amount: 29900,
 *   description: 'Payment for order #1',
 * });
 *
 * const page = await client.listPayments({ count: 20 });
 * ```
 */
export class Razorpay extends RESTler<RazorpayOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Razorpay';

  /**
   * Razorpay `key_id` configured for this client — `auth`'s `username`.
   * `auth` is guaranteed to be `{ type: 'BASIC', ... }` here:
   * {@link _processOption} rejects any other shape at configuration time,
   * so the `'BASIC'` branch is the only one ever reachable. The `key_secret`
   * (`auth.password`) is deliberately NOT exposed through a getter — unlike
   * `key_id`, it's a live credential and this connect never echoes it
   * anywhere observable.
   */
  get keyId(): string {
    const auth = this._getOption('auth');
    return auth.type === 'BASIC' ? auth.username : '';
  }

  /**
   * Creates a new Razorpay client instance.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'BASIC', username: <key_id>, password:
   * <key_secret> }` — see {@link RazorpayOptions.auth}.
   * @throws {RazorpayError} `CONFIG_INVALID_AUTH` when `auth` is missing,
   * isn't `type: 'BASIC'`, `auth.username` isn't a validly-shaped
   * `key_id`, or `auth.password` is empty.
   */
  constructor(options: EventOptionKeys<RazorpayOptions, RESTlerEvents>) {
    super(options, {
      baseURL: 'https://api.razorpay.com/v1',
      timeout: 30,
      contentType: 'JSON',
    });
    // `EventOptionKeys` makes every option optional at the constructor's
    // type level, so an entirely-omitted `auth` never reaches
    // `_processOption` (which only runs for a key actually present in
    // `options`) — catch that case here explicitly, the same way RESTler's
    // own base constructor requires `baseURL`.
    if (!this.hasOption('auth')) {
      throw new RazorpayError('CONFIG_INVALID_AUTH', {});
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Create an Order
   *
   * `POST /orders`
   *
   * @param params - Order creation options; see
   * {@link CreateOrderRequestSchema}. `amount` and `currency` are required.
   * @returns Promise resolving to {@link OrderSchema}.
   * @throws {RazorpayError} `INVALID_REQUEST` when `params` fails local
   * validation; a vendor-mapped code (see {@link Razorpay}'s class doc),
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * const order = await client.createOrder({
   *   amount: 29900,
   *   currency: 'INR',
   *   receipt: 'receipt#1',
   * });
   * console.log(order.id, order.status);
   * ```
   */
  public async createOrder(
    params: CreateOrderRequestSchema,
  ): Promise<OrderSchema> {
    const payload = this.__validate(CreateOrderRequestSchemaObject, params);
    return await this.__requestAndValidate(
      {
        path: '/orders',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      OrderSchemaObject,
    );
  }

  /**
   * Fetch an Order by id
   *
   * `GET /orders/{id}`
   *
   * @param id - Order id (`order_...`).
   * @returns Promise resolving to {@link OrderSchema}.
   * @throws {RazorpayError} `INVALID_REQUEST` when `id` doesn't look like
   * an Order id; a vendor-mapped code (see {@link Razorpay}'s class doc),
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * const order = await client.getOrder('order_EKwxwAgItmmXdp');
   * console.log(order.status);
   * ```
   */
  public async getOrder(id: string): Promise<OrderSchema> {
    const orderId = this.__validate(orderIdGuard, id);
    return await this.__requestAndValidate(
      { path: `/orders/${encodeURIComponent(orderId)}`, method: 'GET' },
      OrderSchemaObject,
    );
  }

  /**
   * Capture an authorized Payment
   *
   * `POST /payments/{id}/capture`
   *
   * @param id - Payment id (`pay_...`).
   * @param params - Capture options; see {@link CapturePaymentRequestSchema}.
   * `amount` must equal the payment's authorized amount; `currency` must
   * match the payment's original currency.
   * @returns Promise resolving to {@link PaymentSchema} with
   * `status: 'captured'`.
   * @throws {RazorpayError} `INVALID_REQUEST` when `id`/`params` fails
   * local validation; a vendor-mapped code (see {@link Razorpay}'s class
   * doc), `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected
   * or malformed response.
   *
   * @example
   * ```typescript
   * const payment = await client.capturePayment('pay_29QQoUBi66xm2f', {
   *   amount: 29900,
   *   currency: 'INR',
   * });
   * console.log(payment.status, payment.captured);
   * ```
   */
  public async capturePayment(
    id: string,
    params: CapturePaymentRequestSchema,
  ): Promise<PaymentSchema> {
    const paymentId = this.__validate(paymentIdGuard, id);
    const payload = this.__validate(CapturePaymentRequestSchemaObject, params);
    return await this.__requestAndValidate(
      {
        path: `/payments/${encodeURIComponent(paymentId)}/capture`,
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      PaymentSchemaObject,
    );
  }

  /**
   * Fetch a Payment by id
   *
   * `GET /payments/{id}`
   *
   * @param id - Payment id (`pay_...`).
   * @returns Promise resolving to {@link PaymentSchema}.
   * @throws {RazorpayError} `INVALID_REQUEST` when `id` doesn't look like
   * a Payment id; a vendor-mapped code (see {@link Razorpay}'s class doc),
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * const payment = await client.getPayment('pay_29QQoUBi66xm2f');
   * console.log(payment.status);
   * ```
   */
  public async getPayment(id: string): Promise<PaymentSchema> {
    const paymentId = this.__validate(paymentIdGuard, id);
    return await this.__requestAndValidate(
      { path: `/payments/${encodeURIComponent(paymentId)}`, method: 'GET' },
      PaymentSchemaObject,
    );
  }

  /**
   * Create a Payment Link
   *
   * `POST /payment_links`
   *
   * @param params - Payment Link creation options; see
   * {@link CreatePaymentLinkRequestSchema}. `amount` is the only required
   * field.
   * @returns Promise resolving to {@link PaymentLinkSchema}.
   * @throws {RazorpayError} `INVALID_REQUEST` when `params` fails local
   * validation (including `callback_method` being supplied as anything
   * other than `'get'`); a vendor-mapped code (see {@link Razorpay}'s class
   * doc), `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected
   * or malformed response.
   *
   * @example
   * ```typescript
   * const link = await client.createPaymentLink({
   *   amount: 29900,
   *   description: 'Payment for order #1',
   *   customer: { name: 'Gaurav Kumar', email: 'gaurav.kumar@example.com' },
   * });
   * console.log(link.short_url);
   * ```
   */
  public async createPaymentLink(
    params: CreatePaymentLinkRequestSchema,
  ): Promise<PaymentLinkSchema> {
    const payload = this.__validate(
      CreatePaymentLinkRequestSchemaObject,
      params,
    );
    return await this.__requestAndValidate(
      {
        path: '/payment_links',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      PaymentLinkSchemaObject,
    );
  }

  /**
   * List Payments
   *
   * `GET /payments`
   *
   * @param params - Pagination options; see
   * {@link ListPaymentsRequestSchema}. Omit entirely for Razorpay's default
   * page (`count: 10`, no offset).
   * @returns Promise resolving to {@link ListPaymentsResponseSchema}.
   * @throws {RazorpayError} `INVALID_REQUEST` when `params` fails local
   * validation; a vendor-mapped code (see {@link Razorpay}'s class doc),
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE` for a vendor-rejected or
   * malformed response.
   *
   * @example
   * ```typescript
   * const page = await client.listPayments({ count: 20, skip: 0 });
   * console.log(page.count, page.items.map((p) => p.id));
   * ```
   */
  public async listPayments(
    params: ListPaymentsRequestSchema = {},
  ): Promise<ListPaymentsResponseSchema> {
    const parsed = this.__validate(ListPaymentsRequestSchemaObject, params);
    const query: Record<string, string> = {};
    if (parsed.count !== undefined) query.count = String(parsed.count);
    if (parsed.skip !== undefined) query.skip = String(parsed.skip);
    return await this.__requestAndValidate(
      { path: '/payments', method: 'GET', query },
      ListPaymentsResponseSchemaObject,
    );
  }

  /**
   * Validates `input` against `guard`, translating a {@link GuardianError}
   * into a {@link RazorpayError} `INVALID_REQUEST` — the shared first step
   * of every endpoint method that accepts caller-supplied input (a request
   * body or a path parameter like an id).
   *
   * @template T - The validated output type.
   * @param guard - Guardian schema to validate `input` against.
   * @param input - The raw, caller-supplied value.
   * @returns The validated value.
   * @throws {RazorpayError} `INVALID_REQUEST` when `input` fails validation.
   */
  private __validate<T>(guard: BaseGuardian<T>, input: unknown): T {
    const [error, parsed] = guard.safeParse(input);
    if (error || parsed === undefined) {
      throw new RazorpayError('INVALID_REQUEST', {
        reason: error?.message ?? 'validation failed',
        responseError: (error as GuardianError | null)?.toJSON(),
      });
    }
    return parsed;
  }

  /**
   * Rejects any `auth` shape other than `{ type: 'BASIC', username:
   * <valid key_id>, password: <non-empty key_secret> }` — `BASIC` is the
   * only auth shape this connect ever accepts (see {@link Razorpay}'s
   * class doc).
   *
   * @param key - The option key to process.
   * @param value - The option value to process.
   * @returns The processed option value.
   * @throws {RazorpayError} `CONFIG_INVALID_AUTH` when `auth` is malformed.
   * @protected
   */
  protected override _processOption<K extends keyof RazorpayOptions>(
    key: K,
    value: RazorpayOptions[K],
  ): RazorpayOptions[K] {
    if (key === 'auth') {
      const auth = value as unknown as RESTlerAuth | undefined;
      const keyId = auth?.type === 'BASIC' ? auth.username : undefined;
      const keySecret = auth?.type === 'BASIC' ? auth.password : undefined;
      const [error] = keyIdGuard.safeParse(keyId);
      // Never echo `value`/`keySecret` here (as a message placeholder or
      // as context) — `auth.password` carries a live Razorpay key_secret,
      // and `context` is stored on the thrown error verbatim (see
      // `RazorpayError`'s `toJSON()`), so anything placed here is just as
      // exposed as the message text.
      if (error || !keySecret) {
        throw new RazorpayError('CONFIG_INVALID_AUTH', {});
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link RazorpayError} — see CONVENTIONS.md's "HTTP client"
   * section for the full rationale.
   *
   * @template B - The expected response body type.
   * @param endpoint - The endpoint to request.
   * @param guard - Guardian schema object for validating the response.
   * @returns The validated response data.
   * @throws {RazorpayError} `RESPONSE_ERROR` when the body fails
   * validation.
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
        throw new RazorpayError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler — translates Razorpay's
   * HTTP-status/error-envelope conventions into a {@link RazorpayError}.
   * Runs on every response (registered on `_responseHandler` in the
   * constructor): an error body is parsed as Razorpay's `{ error: {...} }`
   * envelope, and its `code` — when present and recognised — is mapped to
   * a specific {@link RazorpayError} via {@link VENDOR_ERROR_CODE_MAP};
   * otherwise the HTTP status is mapped via {@link STATUS_ERROR_CODE_MAP}.
   * An unparseable error body falls back to `SERVICE_UNAVAILABLE` for a
   * 5xx response, `RESPONSE_ERROR` otherwise. Does nothing for a
   * successful response, leaving body validation to
   * {@link __requestAndValidate}.
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {RazorpayError} A vendor-mapped code, `RESPONSE_ERROR`, or
   * `SERVICE_UNAVAILABLE`, matching the vendor's documented status/code
   * pairs.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    const [envelopeErr, envelope] = RazorpayErrorEnvelopeSchemaObject
      .safeParse(response.body);
    if (envelopeErr || !envelope) {
      if (status !== null && status >= 500) {
        throw new RazorpayError('SERVICE_UNAVAILABLE', {
          status,
          body: response.body,
        });
      }
      throw new RazorpayError('RESPONSE_ERROR', {
        status,
        body: response.body,
        responseError: (envelopeErr as GuardianError | null)?.toJSON(),
      });
    }

    const detail = envelope.error;
    const meta = {
      status,
      vendorCode: detail.code,
      vendorDescription: detail.description,
      field: detail.field,
      source: detail.source,
      step: detail.step,
      reason: detail.reason,
      metadata: detail.metadata,
    };

    const byCode = VENDOR_ERROR_CODE_MAP[detail.code];
    if (byCode) {
      throw new RazorpayError(byCode, meta);
    }

    const byStatus = status !== null
      ? STATUS_ERROR_CODE_MAP[status]
      : undefined;
    if (byStatus) {
      throw new RazorpayError(byStatus, meta);
    }

    if (status !== null && status >= 500) {
      throw new RazorpayError('SERVER_ERROR', meta);
    }
    throw new RazorpayError('BAD_REQUEST_ERROR', meta);
  }
}
