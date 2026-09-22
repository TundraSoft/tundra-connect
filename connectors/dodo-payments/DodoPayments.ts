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
import { DodoPaymentsError } from './errors/mod.ts';
import {
  type CreatePaymentRequestSchema,
  CreatePaymentRequestSchemaObject,
  type CreatePaymentResponseSchema,
  CreatePaymentResponseSchemaObject,
  type CreateSubscriptionRequestSchema,
  CreateSubscriptionRequestSchemaObject,
  type CreateSubscriptionResponseSchema,
  CreateSubscriptionResponseSchemaObject,
  type CustomerSchema,
  CustomerSchemaObject,
  ErrorResponseSchemaObject,
  type PaymentListItemSchema,
  PaymentListSchemaObject,
  type PaymentSchema,
  PaymentSchemaObject,
  SubscriptionListSchemaObject,
  type SubscriptionSchema,
  SubscriptionSchemaObject,
} from './schema/mod.ts';

/** Dodo's test-mode host — fake money, safe to hammer. */
export const TEST_API = 'https://test.dodopayments.com';
/** Dodo's live-mode host — real money. */
export const LIVE_API = 'https://live.dodopayments.com';

/** Which Dodo environment a client talks to. */
export type DodoPaymentsMode = 'test' | 'live';

/** Page size the auto-paging iterators request when the caller gives none. */
export const DEFAULT_PAGE_SIZE = 100;

/**
 * Hard ceiling on how many pages an auto-paging iterator will fetch.
 *
 * Termination normally comes from an empty page. This exists for the case
 * that cannot terminate on its own: an endpoint that ignores `page_number`
 * and keeps returning the same full page would otherwise spin forever
 * against a rate-limited, money-handling API. Raise it per-call via
 * `maxPages` if you genuinely have more than this.
 */
export const DEFAULT_MAX_PAGES = 1000;

/**
 * Dodo authenticates with a plain Bearer API key, so `BEARER` is the only
 * shape admitted here — RESTler's base `_authInjector` already emits the
 * header, which is why this connect has no `_authInjector` override.
 *
 * Keys are environment-specific: a test-mode key will not work against the
 * live host and vice versa.
 */
export type DodoPaymentsAuth = {
  type: 'BEARER';
  /** Dodo Payments API key, from Dashboard &rarr; Developer &rarr; API Keys. */
  token: string;
  /** Authorization header scheme prefix. Dodo documents `Bearer`. */
  prefix?: string;
};

/** Options for configuring a {@link DodoPayments} client. */
export type DodoPaymentsOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link DodoPaymentsAuth}. */
  auth: DodoPaymentsAuth;
  /**
   * Which environment to talk to. **Defaults to `'test'`** — this client
   * moves real money, so the safe environment is the one you get by
   * omission; reaching production is an explicit act. An explicit
   * `baseURL` overrides this entirely.
   */
  mode?: DodoPaymentsMode;
};

/** Filters for {@link DodoPayments.listPayments}. */
export type ListPaymentsOptions = {
  /** Only this customer's payments — the "show me my order history" case. */
  customerId?: string;
  subscriptionId?: string;
  productId?: string;
  brandId?: string;
  status?: import('./schema/mod.ts').IntentStatusSchema;
  /** ISO-8601 lower bound on `created_at`, inclusive. */
  createdAtGte?: string;
  /** ISO-8601 upper bound on `created_at`, inclusive. */
  createdAtLte?: string;
  /** 1-based page number. */
  pageNumber?: number;
  pageSize?: number;
};

/** Filters for {@link DodoPayments.listSubscriptions}. */
export type ListSubscriptionsOptions = {
  customerId?: string;
  productId?: string;
  brandId?: string;
  status?: import('./schema/mod.ts').SubscriptionStatusSchema;
  createdAtGte?: string;
  createdAtLte?: string;
  pageNumber?: number;
  pageSize?: number;
};

/** Options for {@link DodoPayments.cancelSubscription}. */
export type CancelSubscriptionOptions = {
  /**
   * `true` ends the subscription at the end of the current paid period;
   * `false` (the default) cancels it immediately.
   *
   * Note the vendor keeps `status: 'active'` for a period-end cancellation
   * until that date arrives — the flag to read afterwards is
   * `cancel_at_next_billing_date`, not `status`.
   */
  atPeriodEnd?: boolean;
  /** Free-text note stored against the cancellation. */
  comment?: string;
};

/** The error codes {@link DodoPayments.__toError} can produce. */
type VendorErrorName =
  | 'INVALID_REQUEST'
  | 'AUTH_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

/**
 * Dodo Payments client — the payment and subscription surface a checkout
 * flow actually needs: initialize a payment, read its status, verify it,
 * list a customer's history, and create or cancel a subscription.
 *
 * Dodo is a **merchant of record**: it takes on tax and compliance, which
 * is why `billing.country` is required on every create call.
 *
 * Amounts are always in the currency's SMALLEST unit — cents for USD, yen
 * for JPY. `1999` is $19.99, never $1999.
 *
 * @example
 * ```typescript
 * import { DodoPayments } from '@tundraconnect/dodo-payments';
 *
 * // Defaults to test mode — pass mode: 'live' for real money.
 * const client = new DodoPayments({
 *   auth: { type: 'BEARER', token: 'YOUR_API_KEY', prefix: 'Bearer' },
 * });
 *
 * const created = await client.createPayment({
 *   product_cart: [{ product_id: 'prd_1', quantity: 1 }],
 *   customer: { email: 'buyer@example.com', name: 'Ada' },
 *   billing: { country: 'US' },
 *   payment_link: true,
 * });
 * console.log(created.payment_link); // send the buyer here
 * ```
 */
export class DodoPayments extends RESTler<DodoPaymentsOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'DodoPayments';

  /** Which environment this client is pointed at. */
  get mode(): DodoPaymentsMode {
    return this._getOption('mode') ?? 'test';
  }

  /**
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'BEARER', token, prefix? }` — your Dodo
   * API key for the matching environment.
   * @param options.mode - `'test'` (default) or `'live'`.
   * @throws {DodoPaymentsError} `CONFIG_INVALID_API_KEY` when `auth` is
   * missing, isn't `BEARER`, or its `token` is blank;
   * `CONFIG_INVALID_MODE` when `mode` is neither `'test'` nor `'live'`.
   */
  constructor(options: EventOptionKeys<DodoPaymentsOptions, RESTlerEvents>) {
    const mode = (options as DodoPaymentsOptions).mode ?? 'test';
    super(options as DodoPaymentsOptions, {
      // Resolved before super() so the default host tracks `mode`; an
      // explicit baseURL on `options` still wins, since RESTler treats
      // these as defaults only.
      baseURL: mode === 'live' ? LIVE_API : TEST_API,
      timeout: 30,
      contentType: 'JSON',
    });
    if (!this.hasOption('auth')) {
      throw new DodoPaymentsError('CONFIG_INVALID_API_KEY');
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  // ── Payments ────────────────────────────────────────────────────────────

  /**
   * Initialize a one-time payment — `POST /payments`.
   *
   * Pass `payment_link: true` to get a hosted checkout URL back in
   * `payment_link`; send the buyer there. The returned `client_secret` is
   * a credential for confirming the payment from a client SDK — never log
   * it or expose it outside the buyer's own session.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` when `request`
   * fails local validation; `AUTH_FAILED`, `FORBIDDEN`, `INVALID_REQUEST`,
   * `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `UNKNOWN_ERROR` from the
   * vendor; `RESPONSE_ERROR` when the body fails validation.
   *
   * @example
   * ```typescript
   * const created = await client.createPayment({
   *   product_cart: [{ product_id: 'prd_1', quantity: 2 }],
   *   customer: { customer_id: 'cus_1' },
   *   billing: { country: 'DE' },
   *   payment_link: true,
   *   return_url: 'https://example.com/thanks',
   * });
   * ```
   */
  public async createPayment(
    request: CreatePaymentRequestSchema,
  ): Promise<CreatePaymentResponseSchema> {
    const payload = DodoPayments.__validate(
      CreatePaymentRequestSchemaObject,
      request,
    );
    return await this.__requestAndValidate(
      {
        path: '/payments',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      CreatePaymentResponseSchemaObject,
    );
  }

  /**
   * Fetch one payment's current state — `GET /payments/{payment_id}`.
   *
   * This is the authoritative check after a buyer returns from checkout.
   * **Never trust the browser redirect alone**: the buyer controls it, and
   * a `?status=success` query parameter proves nothing. Read `status` here
   * (or use {@link isPaid}), or act on a verified webhook.
   *
   * @throws {DodoPaymentsError} `NOT_FOUND` when no such payment exists,
   * plus the usual vendor and validation codes.
   *
   * @example
   * ```typescript
   * const payment = await client.getPayment('pay_1');
   * if (payment.status === 'succeeded') fulfil(payment);
   * ```
   */
  public async getPayment(paymentId: string): Promise<PaymentSchema> {
    DodoPayments.__requireId(paymentId, 'paymentId');
    return await this.__requestAndValidate(
      {
        path: `/payments/${encodeURIComponent(paymentId)}`,
        method: 'GET',
      },
      PaymentSchemaObject,
    );
  }

  /**
   * Verify a payment actually completed — `GET /payments/{payment_id}`,
   * reduced to a single boolean.
   *
   * `true` only when `status === 'succeeded'`. Every other state —
   * `processing`, the whole `requires_*` family, a null status — is
   * `false`, because in none of them has money settled. Treating
   * `processing` as paid is the classic way to ship goods for free.
   *
   * @throws {DodoPaymentsError} `NOT_FOUND` when no such payment exists,
   * plus the usual vendor and validation codes.
   *
   * @example
   * ```typescript
   * if (await client.isPaid(paymentId)) {
   *   await fulfilOrder(paymentId);
   * }
   * ```
   */
  public async isPaid(paymentId: string): Promise<boolean> {
    const payment = await this.getPayment(paymentId);
    return payment.status === 'succeeded';
  }

  /**
   * List payments, newest first — `GET /payments`.
   *
   * Pass `customerId` for a single customer's order history, which is the
   * usual reason to call this.
   *
   * @returns One page of payment summaries. These are LIGHTER than
   * {@link getPayment}'s record: no refunds, disputes or product cart.
   *
   * @example
   * ```typescript
   * const history = await client.listPayments({
   *   customerId: 'cus_1',
   *   pageSize: 20,
   * });
   * ```
   */
  public async listPayments(
    options: ListPaymentsOptions = {},
  ): Promise<PaymentListItemSchema[]> {
    const query: Record<string, string> = {};
    if (options.customerId) query.customer_id = options.customerId;
    if (options.subscriptionId) query.subscription_id = options.subscriptionId;
    if (options.productId) query.product_id = options.productId;
    if (options.brandId) query.brand_id = options.brandId;
    if (options.status) query.status = options.status;
    if (options.createdAtGte) query.created_at_gte = options.createdAtGte;
    if (options.createdAtLte) query.created_at_lte = options.createdAtLte;
    if (options.pageNumber !== undefined) {
      query.page_number = String(options.pageNumber);
    }
    if (options.pageSize !== undefined) {
      query.page_size = String(options.pageSize);
    }
    const page = await this.__requestAndValidate(
      { path: '/payments', method: 'GET', query },
      PaymentListSchemaObject,
    );
    return page.items;
  }

  /**
   * Walk EVERY payment matching `options`, transparently fetching each
   * page — the auto-paging counterpart to {@link listPayments}.
   *
   * Pages are requested exactly the way Dodo's own SDK does: the first
   * request omits `page_number` entirely (the vendor treats that as page
   * one) and subsequent requests send `2`, `3`, … Iteration stops on the
   * first EMPTY page rather than on a short one, because the vendor may
   * clamp `page_size` below what was asked for — treating a clamped page
   * as the last one would silently truncate the history.
   *
   * Prefer {@link listPayments} when you only need one page: this issues
   * one request per page and the API is rate limited.
   *
   * @throws {DodoPaymentsError} The same codes as {@link listPayments},
   * raised from whichever page fails.
   *
   * @example
   * ```typescript
   * for await (const payment of client.listAllPayments({ customerId })) {
   *   console.log(payment.payment_id, payment.status);
   * }
   *
   * // Or collect them:
   * const all = await Array.fromAsync(client.listAllPayments({ customerId }));
   * ```
   */
  public async *listAllPayments(
    options: Omit<ListPaymentsOptions, 'pageNumber'> & { maxPages?: number } =
      {},
  ): AsyncGenerator<PaymentListItemSchema, void, unknown> {
    const { maxPages = DEFAULT_MAX_PAGES, ...filters } = options;
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    let pageNumber: number | undefined;
    for (let fetched = 0; fetched < maxPages; fetched++) {
      const page = await this.listPayments({
        ...filters,
        pageSize,
        pageNumber,
      });
      if (page.length === 0) return;
      for (const item of page) yield item;
      pageNumber = (pageNumber ?? 1) + 1;
    }
  }

  // ── Customers ───────────────────────────────────────────────────────────

  /**
   * Fetch one customer's record — `GET /customers/{customer_id}`.
   *
   * Richer than the customer summary embedded in a payment or
   * subscription: this carries `created_at` and the blocklist fields. Use
   * it to render a customer profile alongside their payment and
   * subscription history.
   *
   * The `customer_id` comes from the create call that first saw them —
   * `createPayment`/`createSubscription` return it on `.customer` even
   * when the customer was specified only by email. Store it then; it is
   * the only place it is handed to you.
   *
   * @throws {DodoPaymentsError} `NOT_FOUND` when no such customer exists,
   * plus the usual vendor and validation codes.
   *
   * @example
   * ```typescript
   * const customer = await client.getCustomer('cus_1');
   * console.log(customer.email, customer.created_at);
   * ```
   */
  public async getCustomer(customerId: string): Promise<CustomerSchema> {
    DodoPayments.__requireId(customerId, 'customerId');
    return await this.__requestAndValidate(
      {
        path: `/customers/${encodeURIComponent(customerId)}`,
        method: 'GET',
      },
      CustomerSchemaObject,
    );
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  /**
   * Create a subscription — `POST /subscriptions`.
   *
   * A created subscription is NOT yet an active one. When the response's
   * `payment_method_required` is `true`, the customer still has to
   * complete checkout at `payment_link`, and the subscription sits in
   * `pending` until they do.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` when `request`
   * fails local validation, plus the usual vendor codes.
   *
   * @example
   * ```typescript
   * const sub = await client.createSubscription({
   *   product_id: 'prd_monthly',
   *   quantity: 1,
   *   customer: { email: 'buyer@example.com', name: 'Ada' },
   *   billing: { country: 'US' },
   *   payment_link: true,
   * });
   * if (sub.payment_method_required) redirect(sub.payment_link!);
   * ```
   */
  public async createSubscription(
    request: CreateSubscriptionRequestSchema,
  ): Promise<CreateSubscriptionResponseSchema> {
    const payload = DodoPayments.__validate(
      CreateSubscriptionRequestSchemaObject,
      request,
    );
    return await this.__requestAndValidate(
      {
        path: '/subscriptions',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      CreateSubscriptionResponseSchemaObject,
    );
  }

  /**
   * Fetch one subscription — `GET /subscriptions/{subscription_id}`.
   *
   * @throws {DodoPaymentsError} `NOT_FOUND` when no such subscription
   * exists, plus the usual vendor and validation codes.
   *
   * @example
   * ```typescript
   * const sub = await client.getSubscription('sub_1');
   * console.log(sub.status, sub.next_billing_date);
   * ```
   */
  public async getSubscription(
    subscriptionId: string,
  ): Promise<SubscriptionSchema> {
    DodoPayments.__requireId(subscriptionId, 'subscriptionId');
    return await this.__requestAndValidate(
      {
        path: `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        method: 'GET',
      },
      SubscriptionSchemaObject,
    );
  }

  /**
   * List subscriptions — `GET /subscriptions`. Pass `customerId` for one
   * customer's subscriptions.
   *
   * @example
   * ```typescript
   * const subs = await client.listSubscriptions({
   *   customerId: 'cus_1',
   *   status: 'active',
   * });
   * ```
   */
  public async listSubscriptions(
    options: ListSubscriptionsOptions = {},
  ): Promise<SubscriptionSchema[]> {
    const query: Record<string, string> = {};
    if (options.customerId) query.customer_id = options.customerId;
    if (options.productId) query.product_id = options.productId;
    if (options.brandId) query.brand_id = options.brandId;
    if (options.status) query.status = options.status;
    if (options.createdAtGte) query.created_at_gte = options.createdAtGte;
    if (options.createdAtLte) query.created_at_lte = options.createdAtLte;
    if (options.pageNumber !== undefined) {
      query.page_number = String(options.pageNumber);
    }
    if (options.pageSize !== undefined) {
      query.page_size = String(options.pageSize);
    }
    const page = await this.__requestAndValidate(
      { path: '/subscriptions', method: 'GET', query },
      SubscriptionListSchemaObject,
    );
    return page.items;
  }

  /**
   * Walk EVERY subscription matching `options`, transparently fetching
   * each page — the auto-paging counterpart to
   * {@link listSubscriptions}. Same paging and termination rules as
   * {@link listAllPayments}.
   *
   * @throws {DodoPaymentsError} The same codes as
   * {@link listSubscriptions}, raised from whichever page fails.
   *
   * @example
   * ```typescript
   * for await (const sub of client.listAllSubscriptions({ customerId })) {
   *   console.log(sub.subscription_id, sub.status);
   * }
   * ```
   */
  public async *listAllSubscriptions(
    options:
      & Omit<ListSubscriptionsOptions, 'pageNumber'>
      & { maxPages?: number } = {},
  ): AsyncGenerator<SubscriptionSchema, void, unknown> {
    const { maxPages = DEFAULT_MAX_PAGES, ...filters } = options;
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    let pageNumber: number | undefined;
    for (let fetched = 0; fetched < maxPages; fetched++) {
      const page = await this.listSubscriptions({
        ...filters,
        pageSize,
        pageNumber,
      });
      if (page.length === 0) return;
      for (const item of page) yield item;
      pageNumber = (pageNumber ?? 1) + 1;
    }
  }

  /**
   * Cancel a subscription — `PATCH /subscriptions/{subscription_id}`.
   *
   * By default this cancels IMMEDIATELY (`status: 'cancelled'`), revoking
   * the mandate so no further charge can be taken. Pass
   * `{ atPeriodEnd: true }` to let the customer keep access until the end
   * of the period they have already paid for.
   *
   * Careful when reading the result of a period-end cancellation: the
   * vendor leaves `status` as `'active'` until that date arrives, and
   * records the intent in `cancel_at_next_billing_date`. Checking `status`
   * alone will tell you the cancellation did not take.
   *
   * @throws {DodoPaymentsError} `NOT_FOUND` when no such subscription
   * exists, plus the usual vendor and validation codes.
   *
   * @example
   * ```typescript
   * // Immediately:
   * await client.cancelSubscription('sub_1');
   *
   * // At period end, with a reason:
   * const sub = await client.cancelSubscription('sub_1', {
   *   atPeriodEnd: true,
   *   comment: 'Downgrading to the free tier',
   * });
   * sub.cancel_at_next_billing_date; // true — `status` is still 'active'
   * ```
   */
  public async cancelSubscription(
    subscriptionId: string,
    options: CancelSubscriptionOptions = {},
  ): Promise<SubscriptionSchema> {
    DodoPayments.__requireId(subscriptionId, 'subscriptionId');
    const payload: Record<string, unknown> = options.atPeriodEnd
      ? { cancel_at_next_billing_date: true }
      : { status: 'cancelled' };
    if (options.comment !== undefined) {
      payload.cancellation_comment = options.comment;
    }
    return await this.__requestAndValidate(
      {
        path: `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        method: 'PATCH',
        contentType: 'JSON',
        payload,
      },
      SubscriptionSchemaObject,
    );
  }

  // ── internals ───────────────────────────────────────────────────────────

  /** Rejects a blank path id before it becomes a request to the collection endpoint. */
  private static __requireId(value: string, name: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new DodoPaymentsError('REQUEST_VALIDATION_ERROR', {
        reason: `\`${name}\` must be a non-empty string`,
      });
    }
  }

  /** Parses `input` against `guard`, re-throwing a Guardian failure as this connect's error. */
  private static __validate<B>(guard: BaseGuardian<B>, input: unknown): B {
    try {
      return guard.parse(input);
    } catch (cause) {
      throw new DodoPaymentsError(
        'REQUEST_VALIDATION_ERROR',
        {
          reason: cause instanceof Error ? cause.message : 'validation failed',
          responseError: (cause as GuardianError | undefined)?.toJSON?.(),
        },
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  /**
   * Validates the options this connect owns beyond `RESTlerOptions`.
   * Runs only for keys present on the constructor argument.
   */
  protected override _processOption<K extends keyof DodoPaymentsOptions>(
    key: K,
    value: DodoPaymentsOptions[K],
  ): DodoPaymentsOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as DodoPaymentsAuth;
        if (
          !auth || auth.type !== 'BEARER' || typeof auth.token !== 'string' ||
          auth.token.trim() === ''
        ) {
          throw new DodoPaymentsError('CONFIG_INVALID_API_KEY');
        }
        break;
      }
      case 'mode': {
        if (value !== 'test' && value !== 'live') {
          throw new DodoPaymentsError('CONFIG_INVALID_MODE', {
            mode: String(value),
          });
        }
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link DodoPaymentsError}.
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
        throw new DodoPaymentsError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler. Dodo returns a `{ code, message }` body
   * on failure; the vendor's own `code` is preserved as `vendorCode` while
   * classification is driven by HTTP status, which is the part Dodo
   * documents as stable.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body;

    const [, parsed] = ErrorResponseSchemaObject.safeParse(response.body);
    const detail = parsed ? `${parsed.message} (${parsed.code})` : 'no detail';

    let code: VendorErrorName;
    if (status === 401) code = 'AUTH_FAILED';
    else if (status === 403) code = 'FORBIDDEN';
    else if (status === 404) code = 'NOT_FOUND';
    else if (status === 429) code = 'RATE_LIMITED';
    else if (status === 400 || status === 422) code = 'INVALID_REQUEST';
    else if (status >= 500) code = 'SERVICE_UNAVAILABLE';
    else code = 'UNKNOWN_ERROR';

    throw new DodoPaymentsError(code, {
      status,
      detail,
      vendorCode: parsed?.code,
      body: response.body,
    });
  }
}
