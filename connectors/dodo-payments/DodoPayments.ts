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
import { decodeBase64, encodeBase64 } from '@encoding';
import { constantTimeEqual } from '@crypt';
import type { BaseGuardian, GuardianError } from '@guardian';
import { DodoPaymentsError } from './errors/mod.ts';
import {
  type ChangePlanRequestSchema,
  ChangePlanRequestSchemaObject,
  type ChangePlanResponseSchema,
  ChangePlanResponseSchemaObject,
  type CreateDiscountRequestSchema,
  CreateDiscountRequestSchemaObject,
  type CreatePaymentRequestSchema,
  CreatePaymentRequestSchemaObject,
  type CreatePaymentResponseSchema,
  CreatePaymentResponseSchemaObject,
  type CreateProductRequestSchema,
  CreateProductRequestSchemaObject,
  type CreateSubscriptionRequestSchema,
  CreateSubscriptionRequestSchemaObject,
  type CreateSubscriptionResponseSchema,
  CreateSubscriptionResponseSchemaObject,
  type CustomerPortalSessionSchema,
  CustomerPortalSessionSchemaObject,
  type CustomerSchema,
  CustomerSchemaObject,
  DiscountCustomerListSchemaObject,
  type DiscountCustomerSchema,
  DiscountListSchemaObject,
  type DiscountSchema,
  DiscountSchemaObject,
  type DiscountTypeSchema,
  ErrorResponseSchemaObject,
  type PaymentListItemSchema,
  PaymentListSchemaObject,
  type PaymentSchema,
  PaymentSchemaObject,
  type ProductListItemSchema,
  ProductListSchemaObject,
  type ProductMetadataSchema,
  type ProductSchema,
  ProductSchemaObject,
  SubscriptionListSchemaObject,
  type SubscriptionSchema,
  SubscriptionSchemaObject,
  type UpdateDiscountRequestSchema,
  UpdateDiscountRequestSchemaObject,
  type UpdateProductRequestSchema,
  UpdateProductRequestSchemaObject,
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

/** Filters for {@link DodoPayments.listProducts}. */
export type ListProductsOptions = {
  /**
   * `true` lists only archived products. Dodo lists live and archived
   * products separately, so omitting it lists live products only.
   */
  archived?: boolean;
  /** `true` for subscription products only, `false` for one-time only. */
  recurring?: boolean;
  brandId?: string;
  /** Page number, as Dodo counts them. */
  pageNumber?: number;
  /** At most 100. */
  pageSize?: number;
};

/** Options for {@link DodoPayments.findProductsByMetadata}. */
export type FindProductsByMetadataOptions =
  & Omit<ListProductsOptions, 'pageNumber' | 'archived'>
  & {
    /**
     * Also search archived products. A sync that must not duplicate a
     * product sets this, so it finds an archived match to unarchive.
     */
    includeArchived?: boolean;
    /** Page cap for each pass. @default DEFAULT_MAX_PAGES */
    maxPages?: number;
  };

/** Filters for {@link DodoPayments.listDiscounts}. */
export type ListDiscountsOptions = {
  /** Case-insensitive PARTIAL match on the code: `SAVE` also finds `SAVE20`. */
  code?: string;
  discountType?: DiscountTypeSchema;
  /** `true` for codes that can be redeemed now, `false` for the rest. */
  active?: boolean;
  /** Only codes restricted to this product. */
  productId?: string;
  /** Page number, as Dodo counts them. */
  pageNumber?: number;
  /** At most 100. */
  pageSize?: number;
};

/** Paging for {@link DodoPayments.listDiscountCustomers}. */
export type ListDiscountCustomersOptions = {
  /** Page number, as Dodo counts them. */
  pageNumber?: number;
  /** At most 100. */
  pageSize?: number;
};

/** Options for {@link DodoPayments.createCustomerPortalSession}. */
export type CustomerPortalSessionOptions = {
  /** `true` also emails the link to the customer. */
  sendEmail?: boolean;
  /** Where the portal sends the customer back to; overrides the business default. */
  returnUrl?: string;
};

/** The error codes {@link DodoPayments.__toError} can produce. */
type VendorErrorName =
  | 'INVALID_REQUEST'
  | 'AUTH_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

/**
 * Anything a runtime hands you as request headers — a `Headers` instance or
 * a plain object. Lookup is case-insensitive either way, as HTTP header
 * names are.
 */
export type WebhookHeadersLike =
  | Headers
  | Record<string, string | string[] | undefined>;

/** Standard Webhooks' recommended replay window, in seconds. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

/** Arguments to {@link DodoPayments.verifyWebhook}. */
export type VerifyWebhookOptions = {
  /** The RAW request body, exactly as received — `await req.text()`, never a re-serialized object. */
  payload: string;
  headers: WebhookHeadersLike;
  /** The endpoint's signing secret from the dashboard, with or without `whsec_`. */
  secret: string;
  /** Replay window in seconds. @default DEFAULT_WEBHOOK_TOLERANCE_SECONDS */
  toleranceSeconds?: number;
  /** Clock override, for tests. */
  nowMs?: number;
};

/**
 * Dodo Payments client — the surface a checkout flow and its catalogue
 * need: initialize a payment, read its status, verify it, list a
 * customer's history; create, change, pause or cancel a subscription; open
 * the customer portal; create, find, update and archive products; and
 * manage discount codes.
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
   * Creates a Dodo Payments client.
   *
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
    if (!this._hasOption('auth')) {
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
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
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
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
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
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
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
   *
   * @throws {DodoPaymentsError} `AUTH_FAILED`, `FORBIDDEN`, `INVALID_REQUEST`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or `UNKNOWN_ERROR` from the vendor; `RESPONSE_ERROR` when the page fails validation.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
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
   * Dodo numbers pages from 0: the first request omits `page_number`
   * (which Dodo reads as page 0) and later requests send `1`, `2`, …
   * Iteration stops on the first EMPTY page rather than on a short one,
   * because the vendor may clamp `page_size` below what was asked for —
   * treating a clamped page as the last one would silently truncate the
   * history.
   *
   * Prefer {@link listPayments} when you only need one page: this issues
   * one request per page and the API is rate limited.
   *
   * @throws {DodoPaymentsError} The same codes as {@link listPayments},
   * raised from whichever page fails.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
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
    yield* this.__paginate(
      (pageNumber, pageSize) =>
        this.listPayments({ ...filters, pageNumber, pageSize }),
      filters.pageSize,
      maxPages,
    );
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
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
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

  /**
   * Create a customer portal session — `POST
   * /customers/{customer_id}/customer-portal/session`.
   *
   * The portal is Dodo's hosted page where a customer manages their
   * subscriptions, payment methods and invoices. The returned `link` signs
   * that customer in, so send it only to them and never log it.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for a blank
   * `customerId`; `NOT_FOUND`, `INVALID_REQUEST` and the usual vendor codes;
   * `RESPONSE_ERROR` when the body fails validation.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const { link } = await client.createCustomerPortalSession('cus_1', {
   *   returnUrl: 'https://example.com/account',
   * });
   * ```
   */
  public async createCustomerPortalSession(
    customerId: string,
    options: CustomerPortalSessionOptions = {},
  ): Promise<CustomerPortalSessionSchema> {
    DodoPayments.__requireId(customerId, 'customerId');
    const query: Record<string, string> = {};
    if (options.sendEmail !== undefined) {
      query.send_email = String(options.sendEmail);
    }
    if (options.returnUrl !== undefined) query.return_url = options.returnUrl;
    return await this.__requestAndValidate(
      {
        path: `/customers/${
          encodeURIComponent(customerId)
        }/customer-portal/session`,
        method: 'POST',
        query,
      },
      CustomerPortalSessionSchemaObject,
    );
  }

  // ── Products ────────────────────────────────────────────────────────────

  /**
   * Create a product — `POST /products`.
   *
   * A product is what a customer pays for: a one-time price (a credit
   * pack) or a recurring price (a plan). Store the returned `product_id`
   * and put your own identifier in `metadata`, so a later sync can find
   * the product with {@link findProductsByMetadata} instead of creating a
   * duplicate.
   *
   * For an ongoing subscription, make the subscription period much longer
   * than the payment frequency. When the two are equal (1 month billed
   * monthly), the subscription runs one cycle and then expires instead of
   * renewing. Dodo recommends a period such as 20 years for a monthly plan.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` when `request`
   * fails local validation; `INVALID_REQUEST` and the usual vendor codes;
   * `RESPONSE_ERROR` when the body fails validation.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const plan = await client.createProduct({
   *   name: 'Pro (monthly)',
   *   tax_category: 'saas',
   *   price: {
   *     type: 'recurring_price',
   *     price: 1500, // $15.00
   *     currency: 'USD',
   *     payment_frequency_count: 1,
   *     payment_frequency_interval: 'Month',
   *     subscription_period_count: 20,
   *     subscription_period_interval: 'Year',
   *     trial_period_days: 14,
   *   },
   *   metadata: { plan_code: 'pro_monthly' },
   * });
   * console.log(plan.product_id);
   * ```
   */
  public async createProduct(
    request: CreateProductRequestSchema,
  ): Promise<ProductSchema> {
    const payload = DodoPayments.__validate(
      CreateProductRequestSchemaObject,
      request,
    );
    return await this.__requestAndValidate(
      {
        path: '/products',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      ProductSchemaObject,
    );
  }

  /**
   * Fetch one product — `GET /products/{id}`. Works for archived products
   * too.
   *
   * @throws {DodoPaymentsError} `NOT_FOUND` when no such product exists,
   * plus the usual vendor and validation codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const product = await client.getProduct('pdt_1');
   * if (product.price.type === 'recurring_price') {
   *   console.log(product.price.price, product.price.payment_frequency_interval);
   * }
   * ```
   */
  public async getProduct(productId: string): Promise<ProductSchema> {
    DodoPayments.__requireId(productId, 'productId');
    return await this.__requestAndValidate(
      {
        path: `/products/${encodeURIComponent(productId)}`,
        method: 'GET',
      },
      ProductSchemaObject,
    );
  }

  /**
   * List products — `GET /products`. Live products by default; pass
   * `archived: true` for the archived ones.
   *
   * @returns One page of product summaries. The full price is in each
   * item's `price_detail`.
   *
   * @throws {DodoPaymentsError} `AUTH_FAILED`, `FORBIDDEN`, `INVALID_REQUEST`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or `UNKNOWN_ERROR` from the vendor; `RESPONSE_ERROR` when the page fails validation.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const plans = await client.listProducts({ recurring: true, pageSize: 50 });
   * ```
   */
  public async listProducts(
    options: ListProductsOptions = {},
  ): Promise<ProductListItemSchema[]> {
    const query: Record<string, string> = {};
    if (options.archived !== undefined) {
      query.archived = String(options.archived);
    }
    if (options.recurring !== undefined) {
      query.recurring = String(options.recurring);
    }
    if (options.brandId) query.brand_id = options.brandId;
    if (options.pageNumber !== undefined) {
      query.page_number = String(options.pageNumber);
    }
    if (options.pageSize !== undefined) {
      query.page_size = String(options.pageSize);
    }
    const page = await this.__requestAndValidate(
      { path: '/products', method: 'GET', query },
      ProductListSchemaObject,
    );
    return page.items;
  }

  /**
   * Walk every product matching `options`, fetching each page in turn — the
   * auto-paging counterpart to {@link listProducts}, with the same paging
   * and termination rules as {@link listAllPayments}.
   *
   * @throws {DodoPaymentsError} The same codes as {@link listProducts},
   * raised from whichever page fails.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * for await (const product of client.listAllProducts()) {
   *   console.log(product.product_id, product.name);
   * }
   * ```
   */
  public async *listAllProducts(
    options: Omit<ListProductsOptions, 'pageNumber'> & { maxPages?: number } =
      {},
  ): AsyncGenerator<ProductListItemSchema, void, unknown> {
    const { maxPages = DEFAULT_MAX_PAGES, ...filters } = options;
    yield* this.__paginate(
      (pageNumber, pageSize) =>
        this.listProducts({ ...filters, pageNumber, pageSize }),
      filters.pageSize,
      maxPages,
    );
  }

  /**
   * Find the products whose metadata contains every entry of `match`.
   *
   * Dodo cannot filter by metadata, so this walks the product list and
   * compares locally: one request per page, `includeArchived` doubling
   * that. Values compare strictly, so `{ seats: 5 }` does not match
   * `{ seats: '5' }`.
   *
   * @returns Every match, live products first. An empty array means none.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for an empty
   * `match`, which would match every product; otherwise the same codes as
   * {@link listProducts}.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const [existing] = await client.findProductsByMetadata(
   *   { plan_code: 'pro_monthly' },
   *   { includeArchived: true },
   * );
   * if (!existing) {
   *   // create it
   * }
   * ```
   */
  public async findProductsByMetadata(
    match: ProductMetadataSchema,
    options: FindProductsByMetadataOptions = {},
  ): Promise<ProductListItemSchema[]> {
    const entries = Object.entries(match ?? {});
    if (entries.length === 0) {
      throw new DodoPaymentsError('REQUEST_VALIDATION_ERROR', {
        reason: '`match` must have at least one metadata entry',
      });
    }
    const { includeArchived = false, ...filters } = options;
    const found: ProductListItemSchema[] = [];
    // The live pass sends no `archived` flag, exactly like listProducts().
    const passes: (true | undefined)[] = includeArchived
      ? [undefined, true]
      : [undefined];
    for (const archived of passes) {
      for await (
        const product of this.listAllProducts({ ...filters, archived })
      ) {
        if (entries.every(([key, value]) => product.metadata[key] === value)) {
          found.push(product);
        }
      }
    }
    return found;
  }

  /**
   * Update a product — `PATCH /products/{id}`. Omitted fields are left as
   * they are.
   *
   * Dodo returns no body for an update, so this resolves to nothing; call
   * {@link getProduct} for the updated record.
   *
   * To change a price without touching existing subscribers, create a new
   * product and archive the old one rather than updating `price` here.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for a blank
   * `productId` or an update that fails local validation (including one
   * that changes nothing); `NOT_FOUND`, `INVALID_REQUEST` and the usual
   * vendor codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * await client.updateProduct('pdt_1', {
   *   name: 'Pro (monthly)',
   *   description: 'Everything in Starter, plus custom domains.',
   * });
   * ```
   */
  public async updateProduct(
    productId: string,
    update: UpdateProductRequestSchema,
  ): Promise<void> {
    DodoPayments.__requireId(productId, 'productId');
    const payload = DodoPayments.__validate(
      UpdateProductRequestSchemaObject,
      update,
    );
    await this.__requestNoContent({
      path: `/products/${encodeURIComponent(productId)}`,
      method: 'PATCH',
      contentType: 'JSON',
      payload: payload as unknown as Record<string, unknown>,
    });
  }

  /**
   * Archive a product — `DELETE /products/{id}`.
   *
   * Archiving takes the product off sale and out of the default product
   * list; {@link unarchiveProduct} reverses it. Dodo names this route
   * "archive" even though it uses `DELETE`.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for a blank
   * `productId`; `NOT_FOUND` for an unknown or deleted product, plus the
   * usual vendor codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * await client.archiveProduct('pdt_old_price');
   * ```
   */
  public async archiveProduct(productId: string): Promise<void> {
    DodoPayments.__requireId(productId, 'productId');
    await this.__requestNoContent({
      path: `/products/${encodeURIComponent(productId)}`,
      method: 'DELETE',
    });
  }

  /**
   * Put an archived product back on sale — `POST
   * /products/{id}/unarchive`.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for a blank
   * `productId`; `NOT_FOUND` for an unknown product; `CONFLICT` when the
   * product is not archived; plus the usual vendor codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * await client.unarchiveProduct('pdt_1');
   * ```
   */
  public async unarchiveProduct(productId: string): Promise<void> {
    DodoPayments.__requireId(productId, 'productId');
    await this.__requestNoContent({
      path: `/products/${encodeURIComponent(productId)}/unarchive`,
      method: 'POST',
    });
  }

  // ── Discounts ───────────────────────────────────────────────────────────

  /**
   * Create a discount code — `POST /discounts`.
   *
   * A `percentage` code takes `amount` in basis points (`1500` is 15%),
   * optionally capped per currency. A `flat` code deducts a money amount
   * set per currency in `currency_options[].max_amount_possible`; Dodo
   * still requires `amount`, so set it to the default currency's
   * deduction. `subscription_cycles: 1` limits a subscription's discount
   * to its first payment; omitting it applies the discount for good.
   *
   * Store the returned `discount_id`; a sync can also find the code again
   * with {@link getDiscountByCode} or {@link listDiscounts}.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` when `request`
   * fails local validation, including an unknown field; `INVALID_REQUEST`
   * when Dodo rejects it (a taken code is vendor code
   * `DISCOUNT_CODE_ALREADY_EXISTS`); plus the usual vendor codes and
   * `RESPONSE_ERROR`.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * // 20% off the first payment, new customers only, once each.
   * const discount = await client.createDiscount({
   *   type: 'percentage',
   *   amount: 2000,
   *   code: 'WELCOME20',
   *   subscription_cycles: 1,
   *   per_customer_usage_limit: 1,
   *   customer_eligibility: 'first_time',
   *   metadata: { partner_id: 'acme' },
   * });
   *
   * // $5 off, on orders of $20 or more, until the end of the year.
   * await client.createDiscount({
   *   type: 'flat',
   *   amount: 500,
   *   currency_options: [
   *     { currency: 'USD', is_default: true, max_amount_possible: 500, minimum_subtotal: 2000 },
   *   ],
   *   expires_at: '2026-12-31T23:59:59Z',
   * });
   * ```
   */
  public async createDiscount(
    request: CreateDiscountRequestSchema,
  ): Promise<DiscountSchema> {
    const payload = DodoPayments.__validate(
      CreateDiscountRequestSchemaObject,
      request,
    );
    return await this.__requestAndValidate(
      {
        path: '/discounts',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      DiscountSchemaObject,
    );
  }

  /**
   * Fetch one discount by id — `GET /discounts/{discount_id}`.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for a blank
   * `discountId`; `NOT_FOUND` for an unknown or deleted discount; plus the
   * usual vendor and validation codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const discount = await client.getDiscount('dsc_1');
   * console.log(discount.code, discount.times_used);
   * ```
   */
  public async getDiscount(discountId: string): Promise<DiscountSchema> {
    DodoPayments.__requireId(discountId, 'discountId');
    return await this.__requestAndValidate(
      {
        path: `/discounts/${encodeURIComponent(discountId)}`,
        method: 'GET',
      },
      DiscountSchemaObject,
    );
  }

  /**
   * Fetch a discount by its code — `GET /discounts/code/{code}`. Dodo
   * matches the code without regard to case.
   *
   * This is also a redemption check: Dodo answers an expired or used-up
   * code with a 422, so it fails with `INVALID_REQUEST` rather than
   * returning the record. To read such a code, use
   * `listDiscounts({ code })` and compare `code` exactly.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for a blank
   * `code`; `NOT_FOUND` for an unknown or deleted code; `INVALID_REQUEST`
   * for an expired or used-up one; plus the usual vendor and validation
   * codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const discount = await client.getDiscountByCode('WELCOME20');
   * ```
   */
  public async getDiscountByCode(code: string): Promise<DiscountSchema> {
    DodoPayments.__requireId(code, 'code');
    return await this.__requestAndValidate(
      {
        path: `/discounts/code/${encodeURIComponent(code)}`,
        method: 'GET',
      },
      DiscountSchemaObject,
    );
  }

  /**
   * List discounts, deleted ones excluded — `GET /discounts`.
   *
   * @returns One page of discount records, each as complete as
   * {@link getDiscount}'s.
   *
   * @throws {DodoPaymentsError} `AUTH_FAILED`, `FORBIDDEN`, `INVALID_REQUEST`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or `UNKNOWN_ERROR` from the vendor; `RESPONSE_ERROR` when the page fails validation.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const live = await client.listDiscounts({ active: true, pageSize: 50 });
   * ```
   */
  public async listDiscounts(
    options: ListDiscountsOptions = {},
  ): Promise<DiscountSchema[]> {
    const query: Record<string, string> = {};
    if (options.code) query.code = options.code;
    if (options.discountType) query.discount_type = options.discountType;
    if (options.active !== undefined) query.active = String(options.active);
    if (options.productId) query.product_id = options.productId;
    if (options.pageNumber !== undefined) {
      query.page_number = String(options.pageNumber);
    }
    if (options.pageSize !== undefined) {
      query.page_size = String(options.pageSize);
    }
    const page = await this.__requestAndValidate(
      { path: '/discounts', method: 'GET', query },
      DiscountListSchemaObject,
    );
    return page.items;
  }

  /**
   * Walk every discount matching `options`, fetching each page in turn —
   * the auto-paging counterpart to {@link listDiscounts}, with the same
   * paging and termination rules as {@link listAllPayments}.
   *
   * @throws {DodoPaymentsError} The same codes as {@link listDiscounts},
   * raised from whichever page fails.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * for await (const discount of client.listAllDiscounts()) {
   *   console.log(discount.code, discount.metadata.partner_id);
   * }
   * ```
   */
  public async *listAllDiscounts(
    options: Omit<ListDiscountsOptions, 'pageNumber'> & { maxPages?: number } =
      {},
  ): AsyncGenerator<DiscountSchema, void, unknown> {
    const { maxPages = DEFAULT_MAX_PAGES, ...filters } = options;
    yield* this.__paginate(
      (pageNumber, pageSize) =>
        this.listDiscounts({ ...filters, pageNumber, pageSize }),
      filters.pageSize,
      maxPages,
    );
  }

  /**
   * Update a discount — `PATCH /discounts/{discount_id}`. A partial
   * update: omitted fields are left as they are. `restricted_to` and
   * `currency_options` are REPLACED by what you send; `[]` clears them.
   *
   * Existing subscriptions keep the discount they redeemed; this changes
   * what later redemptions get.
   *
   * @returns The updated discount.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for a blank
   * `discountId` or an update that fails local validation (including one
   * that changes nothing); `NOT_FOUND` for an unknown or deleted discount;
   * `INVALID_REQUEST` when Dodo rejects it, such as a `usage_limit` below
   * `times_used`; plus the usual vendor codes and `RESPONSE_ERROR`.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const discount = await client.updateDiscount('dsc_1', {
   *   expires_at: '2026-12-31T23:59:59Z',
   *   per_customer_usage_limit: null, // back to unlimited
   * });
   * ```
   */
  public async updateDiscount(
    discountId: string,
    update: UpdateDiscountRequestSchema,
  ): Promise<DiscountSchema> {
    DodoPayments.__requireId(discountId, 'discountId');
    const payload = DodoPayments.__validate(
      UpdateDiscountRequestSchemaObject,
      update,
    );
    return await this.__requestAndValidate(
      {
        path: `/discounts/${encodeURIComponent(discountId)}`,
        method: 'PATCH',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      DiscountSchemaObject,
    );
  }

  /**
   * Delete a discount — `DELETE /discounts/{discount_id}`.
   *
   * Dodo soft-deletes it: the code stops working and leaves every list
   * and lookup, and there is no route to restore it.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for a blank
   * `discountId`; `NOT_FOUND` for an unknown or already deleted discount;
   * plus the usual vendor codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * await client.deleteDiscount('dsc_1');
   * ```
   */
  public async deleteDiscount(discountId: string): Promise<void> {
    DodoPayments.__requireId(discountId, 'discountId');
    await this.__requestNoContent({
      path: `/discounts/${encodeURIComponent(discountId)}`,
      method: 'DELETE',
    });
  }

  /**
   * Add customers to a discount's allow list — `POST
   * /discounts/{discount_id}/customers`.
   *
   * The list is what a `customer_eligibility: 'specific'` code checks; a
   * new `specific` code has an empty list and rejects everyone. Adding a
   * customer already on the list is harmless.
   *
   * @param customerIds - 1 to 1000 customer ids. Dodo rejects the whole
   * call when any of them does not exist.
   * @returns The customers added by this call, not the whole list.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for a blank
   * `discountId`, or `customerIds` that is empty, longer than 1000 or holds
   * a blank id; `NOT_FOUND` for an unknown discount; `INVALID_REQUEST` when
   * a customer does not exist; plus the usual vendor codes and
   * `RESPONSE_ERROR`.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * await client.addDiscountCustomers('dsc_1', ['cus_1', 'cus_2']);
   * ```
   */
  public async addDiscountCustomers(
    discountId: string,
    customerIds: string[],
  ): Promise<DiscountCustomerSchema[]> {
    DodoPayments.__requireId(discountId, 'discountId');
    if (
      !Array.isArray(customerIds) || customerIds.length === 0 ||
      customerIds.length > 1000
    ) {
      throw new DodoPaymentsError('REQUEST_VALIDATION_ERROR', {
        reason: '`customerIds` must hold 1 to 1000 customer ids',
      });
    }
    for (const id of customerIds) DodoPayments.__requireId(id, 'customerIds[]');
    const page = await this.__requestAndValidate(
      {
        path: `/discounts/${encodeURIComponent(discountId)}/customers`,
        method: 'POST',
        contentType: 'JSON',
        payload: { customer_ids: customerIds },
      },
      DiscountCustomerListSchemaObject,
    );
    return page.items;
  }

  /**
   * List the customers on a discount's allow list — `GET
   * /discounts/{discount_id}/customers`.
   *
   * @returns One page of `{ customer_id }` entries.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for a blank
   * `discountId`; `NOT_FOUND` for an unknown discount; plus the usual
   * vendor codes and `RESPONSE_ERROR`.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const allowed = await client.listDiscountCustomers('dsc_1', { pageSize: 100 });
   * ```
   */
  public async listDiscountCustomers(
    discountId: string,
    options: ListDiscountCustomersOptions = {},
  ): Promise<DiscountCustomerSchema[]> {
    DodoPayments.__requireId(discountId, 'discountId');
    const query: Record<string, string> = {};
    if (options.pageNumber !== undefined) {
      query.page_number = String(options.pageNumber);
    }
    if (options.pageSize !== undefined) {
      query.page_size = String(options.pageSize);
    }
    const page = await this.__requestAndValidate(
      {
        path: `/discounts/${encodeURIComponent(discountId)}/customers`,
        method: 'GET',
        query,
      },
      DiscountCustomerListSchemaObject,
    );
    return page.items;
  }

  /**
   * Walk a discount's whole allow list, fetching each page in turn — the
   * auto-paging counterpart to {@link listDiscountCustomers}, with the
   * same paging and termination rules as {@link listAllPayments}.
   *
   * @throws {DodoPaymentsError} The same codes as
   * {@link listDiscountCustomers}, raised from whichever page fails.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const ids = (await Array.fromAsync(client.listAllDiscountCustomers('dsc_1')))
   *   .map((entry) => entry.customer_id);
   * ```
   */
  public async *listAllDiscountCustomers(
    discountId: string,
    options:
      & Omit<ListDiscountCustomersOptions, 'pageNumber'>
      & { maxPages?: number } = {},
  ): AsyncGenerator<DiscountCustomerSchema, void, unknown> {
    const { maxPages = DEFAULT_MAX_PAGES, ...filters } = options;
    yield* this.__paginate(
      (pageNumber, pageSize) =>
        this.listDiscountCustomers(discountId, {
          ...filters,
          pageNumber,
          pageSize,
        }),
      filters.pageSize,
      maxPages,
    );
  }

  /**
   * Take a customer off a discount's allow list — `DELETE
   * /discounts/{discount_id}/customers/{customer_id}`.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` for a blank id;
   * `NOT_FOUND` for an unknown discount or a customer not on its list;
   * plus the usual vendor codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * await client.removeDiscountCustomer('dsc_1', 'cus_1');
   * ```
   */
  public async removeDiscountCustomer(
    discountId: string,
    customerId: string,
  ): Promise<void> {
    DodoPayments.__requireId(discountId, 'discountId');
    DodoPayments.__requireId(customerId, 'customerId');
    await this.__requestNoContent({
      path: `/discounts/${encodeURIComponent(discountId)}/customers/${
        encodeURIComponent(customerId)
      }`,
      method: 'DELETE',
    });
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
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
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
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
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
   *
   * @throws {DodoPaymentsError} `AUTH_FAILED`, `FORBIDDEN`, `INVALID_REQUEST`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or `UNKNOWN_ERROR` from the vendor; `RESPONSE_ERROR` when the page fails validation.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
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
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
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
    yield* this.__paginate(
      (pageNumber, pageSize) =>
        this.listSubscriptions({ ...filters, pageNumber, pageSize }),
      filters.pageSize,
      maxPages,
    );
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
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
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
    return await this.__patchSubscription(subscriptionId, payload);
  }

  /**
   * Withdraw a period-end cancellation, so the subscription renews as
   * normal — `PATCH /subscriptions/{subscription_id}` with
   * `cancel_at_next_billing_date: false`.
   *
   * This undoes `cancelSubscription(id, { atPeriodEnd: true })`. An
   * immediate cancellation cannot be undone; the customer has to subscribe
   * again.
   *
   * @throws {DodoPaymentsError} `NOT_FOUND` when no such subscription
   * exists, plus the usual vendor and validation codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const sub = await client.undoScheduledCancellation('sub_1');
   * sub.cancel_at_next_billing_date; // false
   * ```
   */
  public async undoScheduledCancellation(
    subscriptionId: string,
  ): Promise<SubscriptionSchema> {
    DodoPayments.__requireId(subscriptionId, 'subscriptionId');
    return await this.__patchSubscription(subscriptionId, {
      cancel_at_next_billing_date: false,
    });
  }

  /**
   * Pause an active subscription — `PATCH /subscriptions/{subscription_id}`
   * with `status: 'paused'`. No charges are taken while it is paused;
   * {@link resumeSubscription} restarts it.
   *
   * @throws {DodoPaymentsError} `NOT_FOUND` when no such subscription
   * exists; `INVALID_REQUEST` when it cannot be paused from its current
   * state; plus the usual vendor and validation codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const sub = await client.pauseSubscription('sub_1');
   * sub.status; // 'paused'
   * ```
   */
  public async pauseSubscription(
    subscriptionId: string,
  ): Promise<SubscriptionSchema> {
    DodoPayments.__requireId(subscriptionId, 'subscriptionId');
    // Dodo rejects `paused` combined with any other field.
    return await this.__patchSubscription(subscriptionId, { status: 'paused' });
  }

  /**
   * Resume a paused subscription — `PATCH /subscriptions/{subscription_id}`
   * with `status: 'active'`. This also resumes an `on_hold` subscription
   * that has an unpaid pause invoice, and voids that invoice.
   *
   * To keep a subscription that is set to cancel at period end, use
   * {@link undoScheduledCancellation}: its status is still `active`.
   *
   * @throws {DodoPaymentsError} `NOT_FOUND` when no such subscription
   * exists; `INVALID_REQUEST` when it cannot be resumed from its current
   * state; plus the usual vendor and validation codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * const sub = await client.resumeSubscription('sub_1');
   * sub.status; // 'active'
   * ```
   */
  public async resumeSubscription(
    subscriptionId: string,
  ): Promise<SubscriptionSchema> {
    DodoPayments.__requireId(subscriptionId, 'subscriptionId');
    // Dodo rejects `active` combined with any other field.
    return await this.__patchSubscription(subscriptionId, { status: 'active' });
  }

  /**
   * Move a subscription to another product — `POST
   * /subscriptions/{subscription_id}/change-plan`. Use it for upgrades,
   * downgrades and quantity changes.
   *
   * By default the change applies immediately and is charged to the saved
   * payment method, in which case every field of the result is null.
   * `effective_at: 'next_billing_date'` schedules it for renewal instead;
   * {@link cancelScheduledPlanChange} withdraws a scheduled change. The
   * outcome arrives as `subscription.plan_changed` and `payment.succeeded`
   * or `payment.failed` webhooks.
   *
   * @throws {DodoPaymentsError} `REQUEST_VALIDATION_ERROR` when `request`
   * fails local validation; `CONFLICT` while another plan change is still
   * pending; `INVALID_REQUEST` for an inactive or on-demand subscription;
   * plus the usual vendor codes and `RESPONSE_ERROR`.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * await client.changePlan('sub_1', {
   *   product_id: 'pdt_pro_monthly',
   *   quantity: 1,
   *   proration_billing_mode: 'prorated_immediately',
   * });
   * ```
   */
  public async changePlan(
    subscriptionId: string,
    request: ChangePlanRequestSchema,
  ): Promise<ChangePlanResponseSchema> {
    DodoPayments.__requireId(subscriptionId, 'subscriptionId');
    const payload = DodoPayments.__validate(
      ChangePlanRequestSchemaObject,
      request,
    );
    return await this.__requestAndValidate(
      {
        path: `/subscriptions/${
          encodeURIComponent(subscriptionId)
        }/change-plan`,
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      ChangePlanResponseSchemaObject,
    );
  }

  /**
   * Withdraw a plan change scheduled with `effective_at:
   * 'next_billing_date'` — `DELETE
   * /subscriptions/{subscription_id}/change-plan/scheduled`.
   *
   * @throws {DodoPaymentsError} `NOT_FOUND` when there is no scheduled
   * change; `INVALID_REQUEST` when the subscription does not exist (Dodo
   * answers that with a 422); plus the usual vendor and validation codes.
   * @throws {DodoPaymentsError} `TIMEOUT` or `NETWORK_ERROR` (both transient) when
   * no response arrives in time or the request fails before one.
   *
   * @example
   * ```typescript
   * await client.cancelScheduledPlanChange('sub_1');
   * ```
   */
  public async cancelScheduledPlanChange(
    subscriptionId: string,
  ): Promise<void> {
    DodoPayments.__requireId(subscriptionId, 'subscriptionId');
    await this.__requestNoContent({
      path: `/subscriptions/${
        encodeURIComponent(subscriptionId)
      }/change-plan/scheduled`,
      method: 'DELETE',
    });
  }

  // ── internals ───────────────────────────────────────────────────────────

  /**
   * Yields every item of a paged list, one request per page, until an
   * empty page or `maxPages`.
   *
   * Dodo numbers pages from 0, and an omitted `page_number` is page 0
   * (checked against the test-mode API on 2026-10-08: with one product,
   * omitted and `0` both returned it and `1` was empty). Dodo's own SDK
   * steps omitted → 2, which skips page 1; this steps omitted → 1 → 2.
   */
  private async *__paginate<T>(
    fetchPage: (
      pageNumber: number | undefined,
      pageSize: number,
    ) => Promise<T[]>,
    pageSize: number | undefined,
    maxPages: number,
  ): AsyncGenerator<T, void, unknown> {
    const size = pageSize ?? DEFAULT_PAGE_SIZE;
    for (let page = 0; page < maxPages; page++) {
      const items = await fetchPage(page === 0 ? undefined : page, size);
      if (items.length === 0) return;
      yield* items;
    }
  }

  /** `PATCH /subscriptions/{id}` with `payload`, validating the returned record. */
  private async __patchSubscription(
    subscriptionId: string,
    payload: Record<string, unknown>,
  ): Promise<SubscriptionSchema> {
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
   * The exact string Standard Webhooks signs: `<id>.<timestamp>.<payload>`.
   *
   * @example
   * ```typescript
   * DodoPayments.webhookSignedContent('msg_1', '1700000000', '{"a":1}');
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
   * Verifies a Dodo webhook's signature and returns the PARSED payload.
   *
   * Dodo implements the Standard Webhooks spec: `webhook-id`,
   * `webhook-timestamp`, `webhook-signature` (space-separated `v1,<b64>`
   * entries), HMAC-SHA256 over `<id>.<timestamp>.<rawBody>` keyed by the
   * base64-DECODED secret. That decoded-bytes key is why the HMAC here
   * stays on Web Crypto rather than `@tundralibs/crypt`'s `signHMAC`,
   * which treats a string key as UTF-8 and returns hex; the constant-time
   * comparison does come from crypt.
   *
   * Returning the parsed body is deliberate: it makes the verified payload
   * the natural thing to act on, so no unverified object is left lying
   * around.
   *
   * @throws {DodoPaymentsError} `WEBHOOK_INVALID_HEADERS`,
   * `WEBHOOK_TIMESTAMP_INVALID`, `WEBHOOK_SIGNATURE_INVALID`,
   * `WEBHOOK_INVALID_SECRET`, or `RESPONSE_ERROR` when the verified
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
      toleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
      nowMs = Date.now(),
    } = options;
    const id = DodoPayments.__webhookHeader(headers, 'webhook-id');
    const timestamp = DodoPayments.__webhookHeader(
      headers,
      'webhook-timestamp',
    );
    const signature = DodoPayments.__webhookHeader(
      headers,
      'webhook-signature',
    );
    const missing = [['webhook-id', id], ['webhook-timestamp', timestamp], [
      'webhook-signature',
      signature,
    ]]
      .filter(([, v]) => !v).map(([n]) => n);
    if (missing.length > 0) {
      throw new DodoPaymentsError('WEBHOOK_INVALID_HEADERS', {
        reason: `missing ${missing.join(', ')}`,
      });
    }
    const sentAtSec = Number(timestamp);
    if (!Number.isFinite(sentAtSec)) {
      throw new DodoPaymentsError('WEBHOOK_TIMESTAMP_INVALID', {
        reason: `'${timestamp}' is not a Unix timestamp in seconds`,
      });
    }
    // Both directions: a forged far-future timestamp would otherwise be
    // replayable forever.
    const driftSec = Math.abs(nowMs / 1000 - sentAtSec);
    if (driftSec > toleranceSeconds) {
      throw new DodoPaymentsError('WEBHOOK_TIMESTAMP_INVALID', {
        reason: `${
          Math.round(driftSec)
        }s drift exceeds the ${toleranceSeconds}s tolerance`,
      });
    }
    const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    let keyBytes: Uint8Array;
    try {
      keyBytes = decodeBase64(raw);
    } catch (cause) {
      throw new DodoPaymentsError(
        'WEBHOOK_INVALID_SECRET',
        {},
        cause instanceof Error ? cause : undefined,
      );
    }
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
          DodoPayments.webhookSignedContent(id!, timestamp!, payload),
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
    if (!matched) throw new DodoPaymentsError('WEBHOOK_SIGNATURE_INVALID', {});
    try {
      return JSON.parse(payload);
    } catch (cause) {
      throw new DodoPaymentsError(
        'RESPONSE_ERROR',
        {},
        cause instanceof Error ? cause : undefined,
      );
    }
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
   * Makes a request whose success carries no body worth reading (Dodo
   * answers these with an empty 200 or a 204). Failures still go through
   * {@link __toError}.
   */
  private async __requestNoContent(endpoint: RESTlerEndpoint): Promise<void> {
    await this._makeRequest(endpoint);
  }

  /**
   * Every request funnels through here, so a transport failure surfaces as
   * this connect's own error on every path: a timeout as `TIMEOUT`, a
   * failure before any response as `NETWORK_ERROR`, and an exhausted
   * RESTler rate-limit retry (`maxRetryWait`) as `RATE_LIMITED` — all
   * `transient`. A {@link DodoPaymentsError} from the response handler passes
   * through unchanged.
   */
  protected override async _makeRequest<H = ResponseBody, B = H>(
    endpoint: RESTlerEndpoint,
    options: RESTlerRequestOptions<H, B> = {},
  ): Promise<RESTlerResponse<B>> {
    try {
      return await super._makeRequest<H, B>(endpoint, options);
    } catch (err) {
      throw this.__transportError(err, endpoint.timeout);
    }
  }

  /** `err` rewrapped as this connect's transient code, or returned unchanged. */
  private __transportError(err: unknown, timeout: number | undefined): unknown {
    if (err instanceof RESTlerRateLimitError) {
      // RESTler retried once (maxRetryWait) and was throttled again, or the
      // vendor's hint exceeded the cap.
      return new DodoPaymentsError('RATE_LIMITED', {
        status: 429,
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new DodoPaymentsError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    // RESTlerResponseValidationError (and the two above) extend
    // RESTlerRequestError: only a bare one is a failure before any response.
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new DodoPaymentsError('NETWORK_ERROR', {}, err);
    }
    return err;
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
    // 410 is Dodo's answer for a deleted product.
    else if (status === 404 || status === 410) code = 'NOT_FOUND';
    else if (status === 409) code = 'CONFLICT';
    else if (status === 429) code = 'RATE_LIMITED';
    else if (status === 400 || status === 422) code = 'INVALID_REQUEST';
    else if (status >= 500) code = 'SERVICE_UNAVAILABLE';
    else code = 'UNKNOWN_ERROR';

    throw new DodoPaymentsError(code, {
      retryAfterSeconds: this._parseRetryAfter(response.headers),
      status,
      detail,
      vendorCode: parsed?.code,
      body: response.body,
    });
  }
}
