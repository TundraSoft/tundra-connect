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
import { type BaseGuardian, type GuardianError } from '@guardian';
import { API_PREFIX, buildAuthHeaders } from './KalshiAuth.ts';
import { KalshiSigner } from './KalshiSigner.ts';
import { KalshiError } from './errors/mod.ts';
import {
  type Balance,
  BalanceSchemaObject,
  type BatchOrderRow,
  type BatchOrdersResponse,
  BatchOrdersResponseSchemaObject,
  type CancelAck,
  CancelAckSchemaObject,
  type Event,
  type EventPosition,
  type EventsPage,
  EventsPageSchemaObject,
  type ExchangeStatus,
  ExchangeStatusSchemaObject,
  type Fill,
  type FillsPage,
  FillsPageSchemaObject,
  type GetMarketsQuery,
  type Market,
  type MarketPosition,
  type MarketsPage,
  MarketsPageSchemaObject,
  type Order,
  type OrderAck,
  OrderAckSchemaObject,
  type Orderbook,
  OrderbookSchemaObject,
  type OrdersPage,
  OrdersPageSchemaObject,
  type PositionsPage,
  PositionsPageSchemaObject,
  type Series,
  type SeriesListResponse,
  SeriesListResponseSchemaObject,
  SingleEventSchemaObject,
  SingleMarketSchemaObject,
  SingleOrderSchemaObject,
  SingleSeriesSchemaObject,
  type Trade,
  type TradesPage,
  TradesPageSchemaObject,
} from './schema/mod.ts';

/** Production API host, recommended by docs.kalshi.com over the legacy `api.elections.kalshi.com`. */
export const PROD_API = 'https://external-api.kalshi.com';
/** Demo/sandbox API host — fake-money, separate credentials from production. */
export const DEMO_API = 'https://external-api.demo.kalshi.co';

/** Every batch endpoint's shared body/response resource path. */
const BATCH_ORDERS_PATH = `${API_PREFIX}/portfolio/events/orders/batched`;

/**
 * Kalshi credentials — RSA-PSS request signing (docs.kalshi.com). Unlike
 * Polymarket's L1-signs-to-derive-L2-then-signs-with-that flow, there is
 * no derivation step: `accessKey` + `privateKeyPem`, both issued together
 * from the account's API-key settings page, ARE the ready-to-use
 * credential.
 */
export type KalshiAuth = {
  type: 'CUSTOM';
  /** API key id (a UUID), from Kalshi's account API-key settings. */
  accessKey: string;
  /** PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`) RSA private key, paired with `accessKey`. */
  privateKeyPem: string;
};

/**
 * Options for configuring a {@link Kalshi} client. `baseURL` (inherited
 * from `RESTlerOptions`) defaults to {@link PROD_API} — pass
 * {@link DEMO_API} for the fake-money sandbox, or a mock server URL in
 * tests. Unlike Polymarket, Kalshi's market-data AND portfolio/order
 * surfaces share ONE host, so there is no separate `clobBaseURL`-style
 * option to set.
 */
export type KalshiOptions = Omit<RESTlerOptions, 'auth'> & {
  /** Omit entirely for public market-data-only usage — no credentials needed for `getMarkets()`/`getMarket()`/etc. */
  auth?: KalshiAuth;
};

/** BUY buys YES exposure (wire: `bid`); SELL sells YES exposure, equivalently buys NO (wire: `ask`) — same naming/values as Polymarket's `OrderSide`. */
export type OrderSide = 'BUY' | 'SELL';

/** Inputs to {@link Kalshi.submitOrder}. */
export type SubmitOrderOptions = {
  ticker: string;
  side: OrderSide;
  /** Dollars, on-cent, `[0.01, 0.99]` — same convention as Polymarket's `price`. */
  price: number;
  /** Whole contracts. */
  count: number;
  /** V2 has no "market" order type — FAK/FOK-style behavior is an IOC/FOK at an aggressive `price`, the same shape as a Polymarket FAK/FOK. */
  orderType: 'GTC' | 'FOK' | 'FAK';
  /** Unix seconds. Only valid combined with `orderType: 'GTC'`. */
  expirationTime?: number;
  /** Rests as maker-only, never matches immediately. Only valid for GTC. @default false */
  postOnly?: boolean;
  /**
   * Idempotency id, deduped account-wide by Kalshi (a reused id 409s).
   * Auto-generated via `crypto.randomUUID()` when omitted — every order
   * this connect places gets a real dedupe key, without forcing callers
   * to invent one themselves.
   */
  clientOrderId?: string;
  /** `TAKER_AT_CROSS` cancels the incoming order on self-trade; `MAKER` cancels the resting order instead. @default 'TAKER_AT_CROSS' */
  selfTradePreventionType?: 'TAKER_AT_CROSS' | 'MAKER';
};

/** Inputs to {@link Kalshi.submitOrders} — one order per entry, same shape as {@link SubmitOrderOptions}. */
export type BulkOrderInput = SubmitOrderOptions;

/** Inputs to {@link Kalshi.amendOrder} — the order's ticker/side never change; only price/count do. */
export type AmendOrderOptions = {
  ticker: string;
  side: OrderSide;
  price: number;
  count: number;
  clientOrderId?: string;
  /** New idempotency id for the amended order, if you want to track it separately. */
  updatedClientOrderId?: string;
};

/**
 * Convenience result of {@link Kalshi.submitOrder}/{@link Kalshi.submitOrders}/
 * {@link Kalshi.amendOrder} — the raw vendor response plus normalized
 * outcome flags, deliberately shaped like Polymarket's `OrderResult`
 * (`action`/`success`/`filled`/`rejected`/`detail`/`id`/`requestedPrice`/
 * `actualPrice`/`slippage`/`httpStatus`/`raw`) where the concept
 * transfers. `filledCount`/`remainingCount` replace Polymarket's
 * `makingAmount`/`takingAmount` — those describe a maker/taker ASSET-LEG
 * split (USDC vs. shares) that has no equivalent here; Kalshi orders only
 * ever move one thing, contracts.
 *
 * SLIPPAGE SIGN: `slippage` is always `requestedPrice - actualPrice`,
 * computed identically for both sides — so the sign that means
 * "favorable" FLIPS with `action`. For a BUY, filling below the requested
 * price is good, so POSITIVE slippage is favorable. For a SELL, filling
 * above the requested price is good, so NEGATIVE slippage is favorable.
 * Always read `slippage` together with `action`; never treat a bare
 * negative value as a loss.
 */
export type OrderResult = {
  action: OrderSide;
  /** `true` when this order was accepted by the venue (a genuine rejection throws for {@link Kalshi.submitOrder}/{@link Kalshi.amendOrder}, or sets `rejected: true` for a {@link Kalshi.submitOrders} row). */
  success: boolean;
  /** `true` when any contracts filled immediately (`filledCount > 0`) — true for a partial fill too, since Kalshi's ack carries no separate "fully matched" status the way Polymarket's does. */
  filled: boolean;
  /** `true` when a {@link Kalshi.submitOrders} row was rejected. Never set by {@link Kalshi.submitOrder}, which throws `ORDER_REJECTED` instead. */
  rejected: boolean;
  /** The vendor's rejection detail, present when `rejected` is `true`. */
  detail?: string;
  id: string;
  clientOrderId?: string;
  requestedPrice: number;
  /** The venue's volume-weighted average fill price, present only once `filled`. */
  actualPrice?: number;
  /** `requestedPrice - actualPrice` for a filled order; `0` when unfilled/rejected. Can be negative, and which sign is FAVORABLE depends on `action` — see this type's doc comment's SLIPPAGE SIGN note. */
  slippage: number;
  filledCount: number;
  remainingCount: number;
  averageFeePaid?: number;
  httpStatus: number;
  raw: OrderAck | BatchOrderRow;
};

/** Filters for {@link Kalshi.getOrders}. */
export type GetOrdersOptions = {
  ticker?: string;
  eventTicker?: string;
  status?: 'resting' | 'canceled' | 'executed';
  cursor?: string;
  /** 1-1000; vendor default 100. */
  limit?: number;
  /** Unix seconds. */
  minTs?: number;
  maxTs?: number;
};

/** Filters for {@link Kalshi.getPositions}. */
export type GetPositionsOptions = {
  ticker?: string;
  eventTicker?: string;
  cursor?: string;
  limit?: number;
  /** Only return rows with a non-zero value in this field. */
  countFilter?: 'position' | 'total_traded';
};

/** Filters for {@link Kalshi.getFills}. */
export type GetFillsOptions = {
  ticker?: string;
  orderId?: string;
  cursor?: string;
  limit?: number;
  minTs?: number;
  maxTs?: number;
};

/** Filters for {@link Kalshi.getTrades}. */
export type GetTradesOptions = {
  ticker?: string;
  cursor?: string;
  limit?: number;
  minTs?: number;
  maxTs?: number;
};

/** Filters for {@link Kalshi.getEvents}. */
export type GetEventsOptions = {
  seriesTicker?: string;
  status?: 'unopened' | 'open' | 'closed' | 'settled';
  tickers?: string | string[];
  cursor?: string;
  limit?: number;
  withNestedMarkets?: boolean;
};

/** Cents (integer, `0..99`) -> exact fixed-point dollar string, e.g. `42 -> "0.42"`. Built from rounded cents, never float division. */
function dollarsFromCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return `${whole}.${String(frac).padStart(2, '0')}`;
}

/** Whole contracts -> Kalshi's fixed-point count string, e.g. `3 -> "3.00"`. */
function countFp(contracts: number): string {
  return `${contracts}.00`;
}

const TIME_IN_FORCE: Record<SubmitOrderOptions['orderType'], string> = {
  GTC: 'good_till_canceled',
  FOK: 'fill_or_kill',
  FAK: 'immediate_or_cancel',
};

/**
 * Kalshi client — public market-data (`/markets`, `/events`, `/series`,
 * `/exchange/status`, all unauthenticated) and authenticated portfolio/
 * order (`/portfolio/*`, RSA-PSS-signed) REST APIs, on ONE shared host
 * (docs.kalshi.com).
 *
 * Market-data methods need no `auth` at all. Portfolio/order methods need
 * `auth.accessKey` + `auth.privateKeyPem`: every authenticated request is
 * signed for real with the account's RSA private key (see
 * `KalshiSigner.ts`'s KEY CUSTODY note) — this is the account's actual
 * trading credential, not a delegated call to one.
 *
 * @example
 * ```typescript
 * import { Kalshi } from '@tundraconnect/kalshi';
 *
 * // Market data only — no credentials needed.
 * const markets = new Kalshi({});
 * const { markets: page } = await markets.getMarkets({ status: 'open' });
 *
 * // Trading.
 * const client = new Kalshi({
 *   auth: { type: 'CUSTOM', accessKey: 'YOUR_KEY_ID', privateKeyPem: 'YOUR_PEM' },
 * });
 * const balance = await client.getBalance();
 * ```
 */
export class Kalshi extends RESTler<KalshiOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Kalshi';

  private __signer?: KalshiSigner;
  private __accessKey?: string;

  /**
   * @param options - Configuration options for the client.
   * @param options.auth - Portfolio/order credentials — see {@link KalshiOptions}.
   * @throws {KalshiError} `CONFIG_INVALID_PRIVATE_KEY` when `auth` is
   * supplied but `privateKeyPem` isn't a structurally valid PKCS#8 PEM.
   */
  constructor(options: EventOptionKeys<KalshiOptions, RESTlerEvents> = {}) {
    super(options as KalshiOptions, {
      baseURL: PROD_API,
      timeout: 12,
      contentType: 'JSON',
    });
    this._responseHandler = (response) => this.__toError(response);

    const auth = (options as KalshiOptions).auth;
    if (auth) {
      try {
        this.__signer = new KalshiSigner(auth.privateKeyPem);
      } catch (cause) {
        throw new KalshiError(
          'CONFIG_INVALID_PRIVATE_KEY',
          {},
          cause instanceof Error ? cause : undefined,
        );
      }
      this.__accessKey = auth.accessKey;
    }
  }

  /** `true` once `auth.accessKey`/`auth.privateKeyPem` are configured — required for every `/portfolio/*` method. */
  get hasCredentials(): boolean {
    return this.__signer !== undefined && this.__accessKey !== undefined;
  }

  // ── Market data (public, no auth) ───────────────────────────────────────

  /**
   * Fetch one page of markets.
   *
   * @throws {KalshiError} `RESPONSE_ERROR` when the body fails validation.
   *
   * @example
   * ```typescript
   * const { markets, cursor } = await client.getMarkets({ status: 'open', limit: 50 });
   * ```
   */
  public async getMarkets(query: GetMarketsQuery = {}): Promise<MarketsPage> {
    const q: Record<string, string> = {};
    if (query.seriesTicker) q.series_ticker = query.seriesTicker;
    if (query.eventTicker) q.event_ticker = query.eventTicker;
    if (query.status) q.status = query.status;
    const tickers = Kalshi.__joinTickers(query.tickers);
    if (tickers !== undefined) q.tickers = tickers;
    if (query.cursor) q.cursor = query.cursor;
    if (query.limit !== undefined) q.limit = String(query.limit);
    if (query.minCloseTs !== undefined) {
      q.min_close_ts = String(query.minCloseTs);
    }
    if (query.maxCloseTs !== undefined) {
      q.max_close_ts = String(query.maxCloseTs);
    }
    return await this.__requestAndValidate(
      { path: `${API_PREFIX}/markets`, method: 'GET', query: q },
      MarketsPageSchemaObject,
    );
  }

  /**
   * Fetch one market by its exact ticker.
   *
   * @returns The market, or `null` when no market has that ticker.
   * @throws {KalshiError} `RESPONSE_ERROR` when the body fails validation.
   *
   * @example
   * ```typescript
   * const market = await client.getMarket('KXBTCD-26JUL1515-T71799.99');
   * ```
   */
  public async getMarket(ticker: string): Promise<Market | null> {
    try {
      return await this.__requestAndValidate(
        {
          path: `${API_PREFIX}/markets/${encodeURIComponent(ticker)}`,
          method: 'GET',
        },
        SingleMarketSchemaObject,
      );
    } catch (err) {
      if (err instanceof KalshiError && err.code === 'NOT_FOUND') return null;
      throw err;
    }
  }

  /**
   * Fetch a market's order book — bids only on both legs, see
   * {@link Orderbook}'s doc comment for why.
   *
   * @param depth - `0` (default) or negative returns every level; `1-100` caps it.
   *
   * @throws {KalshiError} `NOT_FOUND` when no market has that ticker; `RESPONSE_ERROR` when the body fails validation; or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   */
  public async getOrderbook(
    ticker: string,
    depth?: number,
  ): Promise<Orderbook> {
    const query: Record<string, string> = {};
    if (depth !== undefined) query.depth = String(depth);
    return await this.__requestAndValidate(
      {
        path: `${API_PREFIX}/markets/${encodeURIComponent(ticker)}/orderbook`,
        method: 'GET',
        query,
      },
      OrderbookSchemaObject,
    );
  }

  /**
   * Fetch the public trade tape (market-wide, not account-specific — see {@link Kalshi.getFills} for your own executions).
   *
   * @throws {KalshiError} `RESPONSE_ERROR` when the body fails validation, or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR` from the vendor.
   */
  public async getTrades(options: GetTradesOptions = {}): Promise<TradesPage> {
    const query: Record<string, string> = {};
    if (options.ticker) query.ticker = options.ticker;
    if (options.cursor) query.cursor = options.cursor;
    if (options.limit !== undefined) query.limit = String(options.limit);
    if (options.minTs !== undefined) query.min_ts = String(options.minTs);
    if (options.maxTs !== undefined) query.max_ts = String(options.maxTs);
    return await this.__requestAndValidate(
      { path: `${API_PREFIX}/markets/trades`, method: 'GET', query },
      TradesPageSchemaObject,
    );
  }

  /**
   * Fetch one page of events.
   *
   * @throws {KalshiError} `RESPONSE_ERROR` when the body fails validation, or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR` from the vendor.
   */
  public async getEvents(options: GetEventsOptions = {}): Promise<EventsPage> {
    const query: Record<string, string> = {};
    if (options.seriesTicker) query.series_ticker = options.seriesTicker;
    if (options.status) query.status = options.status;
    const tickers = Kalshi.__joinTickers(options.tickers);
    if (tickers !== undefined) query.tickers = tickers;
    if (options.cursor) query.cursor = options.cursor;
    if (options.limit !== undefined) query.limit = String(options.limit);
    if (options.withNestedMarkets !== undefined) {
      query.with_nested_markets = String(options.withNestedMarkets);
    }
    return await this.__requestAndValidate(
      { path: `${API_PREFIX}/events`, method: 'GET', query },
      EventsPageSchemaObject,
    );
  }

  /**
   * Fetch one event by its exact ticker.
   *
   * @returns The event, or `null` when no event has that ticker.
   *
   * @throws {KalshiError} `RESPONSE_ERROR` when the body fails validation, or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`. A `NOT_FOUND` is NOT thrown — it resolves to `null` instead.
   */
  public async getEvent(
    eventTicker: string,
    withNestedMarkets?: boolean,
  ): Promise<Event | null> {
    const query: Record<string, string> = {};
    if (withNestedMarkets !== undefined) {
      query.with_nested_markets = String(withNestedMarkets);
    }
    try {
      return await this.__requestAndValidate(
        {
          path: `${API_PREFIX}/events/${encodeURIComponent(eventTicker)}`,
          method: 'GET',
          query,
        },
        SingleEventSchemaObject,
      );
    } catch (err) {
      if (err instanceof KalshiError && err.code === 'NOT_FOUND') return null;
      throw err;
    }
  }

  /**
   * Fetch every series matching the given filters.
   *
   * @throws {KalshiError} `RESPONSE_ERROR` when the body fails validation, or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR` from the vendor.
   */
  public async getSeriesList(
    options: { category?: string; tags?: string; includeVolume?: boolean } = {},
  ): Promise<SeriesListResponse> {
    const query: Record<string, string> = {};
    if (options.category) query.category = options.category;
    if (options.tags) query.tags = options.tags;
    if (options.includeVolume !== undefined) {
      query.include_volume = String(options.includeVolume);
    }
    return await this.__requestAndValidate(
      { path: `${API_PREFIX}/series`, method: 'GET', query },
      SeriesListResponseSchemaObject,
    );
  }

  /**
   * Fetch one series by its exact ticker.
   *
   * @returns The series, or `null` when no series has that ticker.
   *
   * @throws {KalshiError} `RESPONSE_ERROR` when the body fails validation, or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`. A `NOT_FOUND` is NOT thrown — it resolves to `null` instead.
   */
  public async getSeries(
    seriesTicker: string,
    includeVolume?: boolean,
  ): Promise<Series | null> {
    const query: Record<string, string> = {};
    if (includeVolume !== undefined) {
      query.include_volume = String(includeVolume);
    }
    try {
      return await this.__requestAndValidate(
        {
          path: `${API_PREFIX}/series/${encodeURIComponent(seriesTicker)}`,
          method: 'GET',
          query,
        },
        SingleSeriesSchemaObject,
      );
    } catch (err) {
      if (err instanceof KalshiError && err.code === 'NOT_FOUND') return null;
      throw err;
    }
  }

  /**
   * Whether the exchange is currently open for trading / accepting state changes.
   *
   * @throws {KalshiError} `RESPONSE_ERROR` when the body fails validation, or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR` from the vendor.
   */
  public async getExchangeStatus(): Promise<ExchangeStatus> {
    return await this.__requestAndValidate(
      { path: `${API_PREFIX}/exchange/status`, method: 'GET' },
      ExchangeStatusSchemaObject,
    );
  }

  // ── Portfolio (authenticated, RSA-PSS-signed) ───────────────────────────

  /**
   * Available balance and portfolio value. Read-only auth proof — a good first call to verify credentials.
   *
   * @throws {KalshiError} `CONFIG_MISSING_PRIVATE_KEY` when no credentials are configured; `AUTH_FAILED` when the venue rejects the signature; `RESPONSE_ERROR` when the body fails validation; or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   */
  public async getBalance(): Promise<Balance> {
    this.__requireCredentials();
    return await this.__requestAndValidate(
      {
        path: `${API_PREFIX}/portfolio/balance`,
        method: 'GET',
        auth: this.__signedAuth(),
      },
      BalanceSchemaObject,
    );
  }

  /**
   * Current positions (market- and event-level).
   *
   * @throws {KalshiError} `CONFIG_MISSING_PRIVATE_KEY` when no credentials are configured; `AUTH_FAILED` when the venue rejects the signature; `RESPONSE_ERROR` when the body fails validation; or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   */
  public async getPositions(
    options: GetPositionsOptions = {},
  ): Promise<PositionsPage> {
    this.__requireCredentials();
    const query: Record<string, string> = {};
    if (options.ticker) query.ticker = options.ticker;
    if (options.eventTicker) query.event_ticker = options.eventTicker;
    if (options.cursor) query.cursor = options.cursor;
    if (options.limit !== undefined) query.limit = String(options.limit);
    if (options.countFilter) query.count_filter = options.countFilter;
    return await this.__requestAndValidate(
      {
        path: `${API_PREFIX}/portfolio/positions`,
        method: 'GET',
        query,
        auth: this.__signedAuth(),
      },
      PositionsPageSchemaObject,
    );
  }

  /**
   * Your own executions, newest first.
   *
   * @throws {KalshiError} `CONFIG_MISSING_PRIVATE_KEY` when no credentials are configured; `AUTH_FAILED` when the venue rejects the signature; `RESPONSE_ERROR` when the body fails validation; or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   */
  public async getFills(options: GetFillsOptions = {}): Promise<FillsPage> {
    this.__requireCredentials();
    const query: Record<string, string> = {};
    if (options.ticker) query.ticker = options.ticker;
    if (options.orderId) query.order_id = options.orderId;
    if (options.cursor) query.cursor = options.cursor;
    if (options.limit !== undefined) query.limit = String(options.limit);
    if (options.minTs !== undefined) query.min_ts = String(options.minTs);
    if (options.maxTs !== undefined) query.max_ts = String(options.maxTs);
    return await this.__requestAndValidate(
      {
        path: `${API_PREFIX}/portfolio/fills`,
        method: 'GET',
        query,
        auth: this.__signedAuth(),
      },
      FillsPageSchemaObject,
    );
  }

  /**
   * Orders on the venue — for restart reconciliation, or checking on a resting order.
   *
   * @throws {KalshiError} `CONFIG_MISSING_PRIVATE_KEY` when no credentials are configured; `AUTH_FAILED` when the venue rejects the signature; `RESPONSE_ERROR` when the body fails validation; or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   */
  public async getOrders(options: GetOrdersOptions = {}): Promise<OrdersPage> {
    this.__requireCredentials();
    const query: Record<string, string> = {};
    if (options.ticker) query.ticker = options.ticker;
    if (options.eventTicker) query.event_ticker = options.eventTicker;
    if (options.status) query.status = options.status;
    if (options.cursor) query.cursor = options.cursor;
    if (options.limit !== undefined) query.limit = String(options.limit);
    if (options.minTs !== undefined) query.min_ts = String(options.minTs);
    if (options.maxTs !== undefined) query.max_ts = String(options.maxTs);
    return await this.__requestAndValidate(
      {
        path: `${API_PREFIX}/portfolio/orders`,
        method: 'GET',
        query,
        auth: this.__signedAuth(),
      },
      OrdersPageSchemaObject,
    );
  }

  /**
   * One order by id (the richer list-shape row — see {@link Order}).
   *
   * @throws {KalshiError} `CONFIG_MISSING_PRIVATE_KEY` when no credentials are configured; `NOT_FOUND` when no order has that id; `AUTH_FAILED`; `RESPONSE_ERROR`; or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   */
  public async getOrder(orderId: string): Promise<Order> {
    this.__requireCredentials();
    return await this.__requestAndValidate(
      {
        path: `${API_PREFIX}/portfolio/orders/${encodeURIComponent(orderId)}`,
        method: 'GET',
        auth: this.__signedAuth(),
      },
      SingleOrderSchemaObject,
    );
  }

  /**
   * Place one order — limit (GTC) or IOC/FOK-style (FAK/FOK at an
   * aggressive `price`, the same shape as a Polymarket market order).
   * Validates `price`/`count` locally BEFORE signing/sending anything —
   * see {@link Kalshi.__toOrderBody}.
   *
   * @throws {KalshiError} `CONFIG_MISSING_PRIVATE_KEY` when `auth` is
   * unset, `ORDER_REJECTED` for a locally-refused or venue-rejected order.
   *
   * @example
   * ```typescript
   * const result = await client.submitOrder({
   *   ticker: 'KXBTCD-26JUL1515-T71799.99',
   *   side: 'BUY',
   *   price: 0.42,
   *   count: 3,
   *   orderType: 'GTC',
   * });
   * if (result.filled) console.log(result.filledCount, result.actualPrice);
   * ```
   */
  public async submitOrder(options: SubmitOrderOptions): Promise<OrderResult> {
    this.__requireCredentials();
    const body = Kalshi.__toOrderBody(options);
    try {
      const ack = await this.__requestAndValidate(
        {
          path: `${API_PREFIX}/portfolio/events/orders`,
          method: 'POST',
          contentType: 'JSON',
          payload: body,
          auth: this.__signedAuth(),
        },
        OrderAckSchemaObject,
      );
      return Kalshi.__toOrderResult(options.side, options.price, ack, 201);
    } catch (err) {
      throw Kalshi.__toOrderRejection(err);
    }
  }

  /**
   * Place up to Kalshi's tier-scaled batch limit in one `POST
   * .../orders/batched` call (no fixed cap is documented, so unlike
   * Polymarket's `submitOrders` this never auto-chunks — a batch that
   * exceeds your tier's limit is refused as a whole request, which
   * surfaces as a thrown `INVALID_REQUEST`/`ORDER_REJECTED`, not a
   * per-row result). Each input order maps to exactly one result, in the
   * same order. A VENDOR-side rejection of one row never throws and never
   * discards the other rows' outcomes — `rejected`/`detail` are set on
   * that row instead. A LOCALLY-refused order (an off-cent price, a
   * non-positive count) refuses the WHOLE batch before any request is
   * sent, rather than silently dropping just that one order: it usually
   * means a bug in how the caller built the batch (e.g. a shared
   * price-computation error affecting more than one order), not a
   * business-logic decision the way a vendor rejection is.
   *
   * @throws {KalshiError} `CONFIG_MISSING_PRIVATE_KEY`, `ORDER_REJECTED`
   * for a locally-refused order (checked before any request is sent) or a
   * whole-batch rejection, `RESPONSE_ERROR` if a 2xx response doesn't
   * match the expected batch shape.
   */
  public async submitOrders(
    orders: readonly BulkOrderInput[],
  ): Promise<OrderResult[]> {
    if (orders.length === 0) return [];
    this.__requireCredentials();
    const bodies = orders.map((order) => Kalshi.__toOrderBody(order));
    let response: RESTlerResponse<unknown>;
    try {
      response = await this._makeRequest<BatchOrdersResponse>(
        {
          path: BATCH_ORDERS_PATH,
          method: 'POST',
          contentType: 'JSON',
          payload: { orders: bodies },
          auth: this.__signedAuth(),
        },
        {
          responseSchema: (data) => BatchOrdersResponseSchemaObject.parse(data),
        },
      );
    } catch (err) {
      if (err instanceof RESTlerResponseValidationError) {
        throw new KalshiError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw Kalshi.__toOrderRejection(err);
    }
    const status = response.status ?? 0;
    const rows = (response.body as BatchOrdersResponse).orders;
    // Attribute each row by IDENTITY, not position. Every order body carries
    // a `client_order_id` (supplied, or generated in `__toOrderBody`) and the
    // venue round-trips it, so a response that ever reorders or drops a row
    // still lands on the right request. Positional indexing alone would
    // silently mis-attribute `action`/`requestedPrice` — and therefore
    // `slippage` — to a different order than the one the row describes.
    const byClientOrderId = new Map<string, number>();
    bodies.forEach((body, i) => {
      byClientOrderId.set(body.client_order_id as string, i);
    });
    return rows.map((row, i) => {
      const matched = row.clientOrderId !== undefined
        ? byClientOrderId.get(row.clientOrderId)
        : undefined;
      const input = orders[matched ?? i];
      if (input === undefined) {
        // Reachable only if the venue returns more rows than were sent (or an
        // id from no submitted order). Raised as this connect's one error
        // class rather than letting a positional read past the end of
        // `orders` surface as a raw TypeError.
        throw new KalshiError('RESPONSE_ERROR', {
          detail:
            `batch row ${i} matches no submitted order (${orders.length} sent, ${rows.length} returned)`,
        });
      }
      return Kalshi.__toBatchOrderResult(input.side, input.price, row, status);
    });
  }

  /**
   * Amend a resting order's price/count. Queue position is preserved only
   * when the amendment is a pure size DECREASE; anything else re-queues.
   *
   * @throws {KalshiError} `CONFIG_MISSING_PRIVATE_KEY`, `ORDER_REJECTED`.
   */
  public async amendOrder(
    orderId: string,
    options: AmendOrderOptions,
  ): Promise<OrderResult> {
    this.__requireCredentials();
    const cents = Kalshi.__toValidCents(options.price);
    const body: Record<string, unknown> = {
      ticker: options.ticker,
      side: options.side === 'BUY' ? 'bid' : 'ask',
      price: dollarsFromCents(cents),
      count: countFp(Kalshi.__toValidCount(options.count)),
    };
    if (options.clientOrderId) body.client_order_id = options.clientOrderId;
    if (options.updatedClientOrderId) {
      body.updated_client_order_id = options.updatedClientOrderId;
    }
    try {
      const ack = await this.__requestAndValidate(
        {
          path: `${API_PREFIX}/portfolio/events/orders/${
            encodeURIComponent(orderId)
          }/amend`,
          method: 'POST',
          contentType: 'JSON',
          payload: body,
          auth: this.__signedAuth(),
        },
        OrderAckSchemaObject,
      );
      return Kalshi.__toOrderResult(options.side, options.price, ack, 200);
    } catch (err) {
      throw Kalshi.__toOrderRejection(err);
    }
  }

  /**
   * Cancel one resting order. Response shape is distinct from
   * {@link OrderResult} — it reports `reducedBy`, not a fill/remaining
   * pair (there is nothing left to fill on a canceled order).
   *
   * @throws {KalshiError} `CONFIG_MISSING_PRIVATE_KEY`.
   */
  public async cancelOrder(orderId: string): Promise<CancelAck> {
    this.__requireCredentials();
    return await this.__requestAndValidate(
      {
        path: `${API_PREFIX}/portfolio/events/orders/${
          encodeURIComponent(orderId)
        }`,
        method: 'DELETE',
        auth: this.__signedAuth(),
      },
      CancelAckSchemaObject,
    );
  }

  /**
   * Cancel a batch of resting orders by id. Response shape is the raw
   * per-row vendor result (`orderId`/`reducedBy`/`error?`) — same reasoning
   * as {@link cancelOrder} for not forcing this into {@link OrderResult}.
   *
   * @throws {KalshiError} `CONFIG_MISSING_PRIVATE_KEY`.
   */
  public async cancelOrders(
    orderIds: readonly string[],
  ): Promise<BatchOrderRow[]> {
    if (orderIds.length === 0) return [];
    this.__requireCredentials();
    const response = await this.__requestAndValidate(
      {
        path: BATCH_ORDERS_PATH,
        method: 'DELETE',
        contentType: 'JSON',
        payload: { orders: orderIds.map((id) => ({ order_id: id })) },
        auth: this.__signedAuth(),
      } as unknown as RESTlerEndpoint, // DELETE-with-body — RESTlerMethodPayload models DELETE as body-less; the runtime doesn't actually restrict this, only the type does (same cast rationale as Polymarket's __deleteWithBody)
      BatchOrdersResponseSchemaObject,
    );
    return response.orders;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private __requireCredentials(): void {
    if (!this.__signer || !this.__accessKey) {
      throw new KalshiError('CONFIG_MISSING_PRIVATE_KEY');
    }
  }

  /** Per-call auth marker read by {@link _authInjector} — opt-in per request, mirrors Polymarket's `__l2Auth`/`__relayerAuth` markers so a public market-data call can never accidentally pick up signed headers. */
  private __signedAuth(): RESTlerAuth {
    return { type: 'CUSTOM', kalshiSigned: true };
  }

  /**
   * Injects the three `KALSHI-ACCESS-*` headers when `endpoint.auth`
   * carries this connect's signed-request marker. Deliberately does NOT
   * fall back to the instance-level `_getOption('auth')` the way the base
   * BASIC/BEARER handling does — market-data calls never set the marker,
   * so they can never accidentally sign.
   */
  protected override async _authInjector(
    endpoint: RESTlerEndpoint,
  ): Promise<void> {
    // Preserves the base class's config validation (throws
    // RESTlerConfigError for a malformed `endpoint.auth`) — a no-op beyond
    // that for `type: 'CUSTOM'` (the base class only sets headers itself
    // for BASIC/BEARER), so this never interferes with the signing below.
    await super._authInjector(endpoint);

    const auth = endpoint.auth as
      | { type: 'CUSTOM'; kalshiSigned?: boolean }
      | undefined;
    if (!auth || auth.type !== 'CUSTOM' || !auth.kalshiSigned) return;
    if (!this.__signer || !this.__accessKey) return; // __requireCredentials already guards every call site above; this is defense in depth only

    endpoint.headers = endpoint.headers ?? {};
    const method = (endpoint as { method: string }).method;
    const timestampMs = Date.now();
    const headers = await buildAuthHeaders(
      this.__signer,
      this.__accessKey,
      timestampMs,
      method,
      endpoint.path,
    );
    Object.assign(endpoint.headers, headers);
  }

  /** Marks Kalshi's access-signature header as sensitive so it never surfaces in `call`/`authFailure` event payloads or thrown-error request contexts. */
  protected override _isSensitiveHeader(name: string): boolean {
    return name.toUpperCase() === 'KALSHI-ACCESS-SIGNATURE' ||
      super._isSensitiveHeader(name);
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link KalshiError}.
   */
  /**
   * Seconds a caller should wait before retrying after a 429, read from
   * whichever rate-limit header the vendor sent: `Retry-After` (delta
   * seconds or an HTTP-date), `X-RateLimit-Reset-After` (delta seconds),
   * or `X-RateLimit-Reset` / `RateLimit-Reset` (a Unix epoch in seconds or
   * milliseconds). `undefined` when none is present or parseable — the
   * value is only ever what the vendor said, never a guess.
   */
  private static __retryAfterSeconds(
    headers: Record<string, string> | undefined,
    nowMs = Date.now(),
  ): number | undefined {
    if (!headers) return undefined;
    const get = (name: string): string | undefined =>
      headers[name] ?? headers[name.toLowerCase()];
    const retryAfter = get('retry-after');
    if (retryAfter !== undefined) {
      const n = Number(retryAfter);
      if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
      const at = Date.parse(retryAfter);
      if (Number.isFinite(at)) {
        return Math.max(0, Math.ceil((at - nowMs) / 1000));
      }
    }
    const resetAfter = get('x-ratelimit-reset-after');
    if (resetAfter !== undefined) {
      const n = Number(resetAfter);
      if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
    }
    const reset = get('x-ratelimit-reset') ?? get('ratelimit-reset');
    if (reset !== undefined) {
      const n = Number(reset);
      if (Number.isFinite(n) && n > 0) {
        const epochMs = n > 1e12 ? n : n * 1000;
        return Math.max(0, Math.ceil((epochMs - nowMs) / 1000));
      }
    }
    return undefined;
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
        throw new KalshiError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler, shared by every market-data and
   * portfolio call. Kalshi's error envelope is `{"error": {"code",
   * "message", "details"?}}` — extracted by {@link __errorDetail} for
   * `INVALID_REQUEST`/`AUTH_FAILED`'s `detail` field.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    const context = { status, body: response.body };
    if (status === 401) {
      throw new KalshiError('AUTH_FAILED', {
        ...context,
        detail: Kalshi.__errorDetail(response.body),
      });
    }
    if (status === 404) throw new KalshiError('NOT_FOUND', context);
    if (status === 409) {
      // The vendor's documented response to a duplicate client_order_id —
      // SubmitOrderOptions.clientOrderId's own doc comment anticipates
      // this ("a reused id 409s"). Mapped to ORDER_REJECTED (not a generic
      // UNKNOWN_ERROR) so a caller handling that code for the idempotency
      // retry case it exists for actually catches this.
      throw new KalshiError('ORDER_REJECTED', {
        detail: Kalshi.__errorDetail(response.body),
      });
    }
    if (status === 429) {
      throw new KalshiError('RATE_LIMITED', {
        ...context,
        retryAfterSeconds: Kalshi.__retryAfterSeconds(response.headers),
      });
    }
    if (status === 400 || status === 422) {
      throw new KalshiError('INVALID_REQUEST', {
        ...context,
        detail: Kalshi.__errorDetail(response.body),
      });
    }
    if (status >= 500) throw new KalshiError('SERVICE_UNAVAILABLE', context);
    throw new KalshiError('UNKNOWN_ERROR', context);
  }

  /** Extracts a human-readable detail string from `{"error": {"message": "..."}}`, `{"error": "..."}`, or a bare string, without assuming any one shape. */
  private static __errorDetail(body: unknown): string {
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object' && 'error' in body) {
      const value = (body as { error: unknown }).error;
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object' && 'message' in value) {
        const message = (value as { message: unknown }).message;
        if (typeof message === 'string') return message;
      }
    }
    return 'unknown reason';
  }

  /**
   * Remaps a generic `INVALID_REQUEST` (the shared `__toError` status-code
   * mapping) to the more specific `ORDER_REJECTED` for order-submission
   * call sites — every other error code (auth, rate limit, service
   * unavailable, a local pre-flight `ORDER_REJECTED`) passes through
   * unchanged. Mirrors the Polymarket connect's own lesson (see that
   * connect's Relayer error-mapping history) that a remap must target one
   * specific, well-understood status, never a catch-all.
   */
  private static __toOrderRejection(err: unknown): unknown {
    if (err instanceof KalshiError && err.code === 'INVALID_REQUEST') {
      return new KalshiError('ORDER_REJECTED', {
        detail: err.getContextValue('detail') ?? 'unknown reason',
      }, err);
    }
    return err;
  }

  /** Validates a decimal dollar price is on-cent and in `[0.01, 0.99]`, returning the equivalent integer cents. Never accepts a pre-formatted string — see this module's `dollarsFromCents` doc comment for the bug class this sidesteps. */
  private static __toValidCents(price: number): number {
    const cents = Math.round(price * 100);
    if (!Number.isFinite(price) || Math.abs(price * 100 - cents) > 1e-6) {
      throw new KalshiError('ORDER_REJECTED', {
        detail: `price ${price} is not on the 1-cent tick`,
      });
    }
    if (cents < 1 || cents > 99) {
      throw new KalshiError('ORDER_REJECTED', {
        detail: `price ${price} outside [0.01, 0.99]`,
      });
    }
    return cents;
  }

  /** Validates a whole positive contract count. */
  private static __toValidCount(count: number): number {
    if (!Number.isInteger(count) || count < 1) {
      throw new KalshiError('ORDER_REJECTED', {
        detail: `count ${count} below the 1-contract minimum`,
      });
    }
    return count;
  }

  /**
   * Comma-joins a `tickers` filter (string or array) for a query param,
   * or `undefined` when there's nothing to filter by. An empty ARRAY is
   * deliberately treated the same as `undefined` (omit the param) rather
   * than joined into `''` — `?tickers=` would filter to the literal empty
   * ticker (matching nothing) instead of the caller's likely intent of
   * "no filter, return everything".
   */
  private static __joinTickers(
    tickers: string | string[] | undefined,
  ): string | undefined {
    if (tickers === undefined) return undefined;
    if (Array.isArray(tickers)) {
      return tickers.length > 0 ? tickers.join(',') : undefined;
    }
    return tickers.length > 0 ? tickers : undefined;
  }

  /**
   * Builds the exact V2 `POST /portfolio/events/orders` (and batch) body
   * for one order — the shared step between {@link submitOrder} and
   * {@link submitOrders}. Validates locally BEFORE any network call, the
   * same pre-flight rail the Rust reference proved out against Kalshi's
   * demo environment (a doomed order is refused here, never sent).
   */
  private static __toOrderBody(
    options: SubmitOrderOptions,
  ): Record<string, unknown> {
    const cents = Kalshi.__toValidCents(options.price);
    const count = Kalshi.__toValidCount(options.count);
    const clientOrderId = options.clientOrderId ?? crypto.randomUUID();
    const body: Record<string, unknown> = {
      ticker: options.ticker,
      side: options.side === 'BUY' ? 'bid' : 'ask',
      count: countFp(count),
      price: dollarsFromCents(cents),
      time_in_force: TIME_IN_FORCE[options.orderType],
      self_trade_prevention_type: options.selfTradePreventionType === 'MAKER'
        ? 'maker'
        : 'taker_at_cross',
      client_order_id: clientOrderId,
    };
    if (options.expirationTime !== undefined) {
      body.expiration_time = options.expirationTime;
    }
    if (options.postOnly) body.post_only = true;
    return body;
  }

  /** Rounds to 6dp to avoid binary-float noise leaking into a human-facing price/slippage value — see the Polymarket connect's identical `__round6` for the exact motivating example. */
  private static __round6(value: number): number {
    return Math.round(value * 1e6) / 1e6;
  }

  private static __toOrderResult(
    side: OrderSide,
    requestedPrice: number,
    ack: OrderAck,
    httpStatus: number,
  ): OrderResult {
    const filledCount = ack.fillCount ?? 0;
    const remainingCount = ack.remainingCount ?? 0;
    const actualPrice = ack.averageFillPrice;
    return {
      action: side,
      success: true,
      filled: filledCount > 0,
      rejected: false,
      id: ack.orderId,
      clientOrderId: ack.clientOrderId,
      requestedPrice,
      actualPrice,
      slippage: actualPrice !== undefined
        ? Kalshi.__round6(requestedPrice - actualPrice)
        : 0,
      filledCount,
      remainingCount,
      averageFeePaid: ack.averageFeePaid,
      httpStatus,
      raw: ack,
    };
  }

  private static __toBatchOrderResult(
    side: OrderSide,
    requestedPrice: number,
    row: BatchOrderRow,
    httpStatus: number,
  ): OrderResult {
    if (row.error) {
      return {
        action: side,
        success: false,
        filled: false,
        rejected: true,
        detail: row.error.message,
        id: row.orderId ?? '',
        clientOrderId: row.clientOrderId,
        requestedPrice,
        slippage: 0,
        filledCount: 0,
        remainingCount: 0,
        httpStatus,
        raw: row,
      };
    }
    const filledCount = row.fillCount ?? 0;
    const remainingCount = row.remainingCount ?? 0;
    const actualPrice = row.averageFillPrice;
    return {
      action: side,
      success: true,
      filled: filledCount > 0,
      rejected: false,
      id: row.orderId ?? '',
      clientOrderId: row.clientOrderId,
      requestedPrice,
      actualPrice,
      slippage: actualPrice !== undefined
        ? Kalshi.__round6(requestedPrice - actualPrice)
        : 0,
      filledCount,
      remainingCount,
      averageFeePaid: row.averageFeePaid,
      httpStatus,
      raw: row,
    };
  }
}

export type {
  Balance,
  BatchOrderRow,
  CancelAck,
  Event,
  EventPosition,
  EventsPage,
  ExchangeStatus,
  Fill,
  FillsPage,
  Market,
  MarketPosition,
  MarketsPage,
  Order,
  OrderAck,
  Orderbook,
  OrdersPage,
  PositionsPage,
  Series,
  SeriesListResponse,
  Trade,
  TradesPage,
};
