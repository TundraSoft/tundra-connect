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
import { type BaseGuardian, type GuardianError } from '@guardian';
import { checksumAddress } from './PolymarketEip712.ts';
import {
  buildL1Headers,
  buildL2Headers,
  type L2Credentials,
} from './PolymarketAuth.ts';
import { PolymarketSigner } from './PolymarketSigner.ts';
import {
  buildOrder,
  type BuildOrderParams,
  type OrderSide,
  orderWireJson,
  type ProtocolVersion,
  SIG_TYPE_POLY_PROXY,
  signOrder,
} from './PolymarketOrder.ts';
import type { ProxyTransaction } from './PolymarketAbi.ts';
import {
  buildMergeTx,
  buildProxyMetaTx,
  buildRedeemTx,
  buildSplitTx,
} from './PolymarketRelayer.ts';
import { PolymarketError } from './errors/mod.ts';
import {
  type ClobApiCredentials,
  ClobApiCredentialsSchemaObject,
  type ClobBalance,
  ClobBalanceSchemaObject,
  type ClobCancelResponse,
  ClobCancelResponseSchemaObject,
  ClobNegRiskSchemaObject,
  type ClobOpenOrdersPage,
  ClobOpenOrdersPageSchemaObject,
  type ClobOrderBook,
  ClobOrderBookSchemaObject,
  type ClobPostOrderResponse,
  ClobPostOrderResponseSchemaObject,
  ClobTickSizeSchemaObject,
  type ClobTradesPage,
  ClobTradesPageSchemaObject,
  ClobVersionSchemaObject,
  type DataPosition,
  DataPositionListSchemaObject,
  DataValueListSchemaObject,
  type GammaMarket,
  GammaMarketKeysetPageSchemaObject,
  GammaMarketListSchemaObject,
  GammaMarketSchemaObject,
  type RelayerSubmitResponse,
  RelayerSubmitResponseSchemaObject,
  RelayPayloadSchemaObject,
} from './schema/mod.ts';

/** Maximum orders per `POST /orders` call — {@link Polymarket.submitOrders} chunks larger inputs into requests of at most this many. */
const BULK_ORDER_CHUNK_SIZE = 15;

/** Production Gamma API host — public market discovery, no auth. */
export const GAMMA_API = 'https://gamma-api.polymarket.com';
/** Production CLOB API host — trading, L1/L2 auth. */
export const CLOB_API = 'https://clob.polymarket.com';
/** Production Relayer API host — gasless split/merge/redeem meta-transactions. */
export const RELAYER_API = 'https://relayer-v2.polymarket.com';
/** Production Data API host — public, read-only portfolio view (positions, value) keyed by wallet address. */
export const DATA_API = 'https://data-api.polymarket.com';
/** Polygon mainnet chain id — the CLOB rejects any other chain id in production. */
export const POLYGON_CHAIN_ID = 137;

const VERSION_MISMATCH_MARKER = 'order_version_mismatch';
const FAK_NO_MATCH_MARKER = 'no orders found to match with fak order';
const FOK_NO_MATCH_MARKER = "order couldn't be fully filled";

/**
 * CLOB trading credentials. Held only as long as this client instance
 * lives; the raw `privateKey` never survives past construction (it is
 * consumed by {@link PolymarketSigner}, which never exposes it again — see
 * that module's KEY CUSTODY note). Omit `auth` entirely for Gamma-only
 * (public market data) usage — no wallet is needed for that half of the
 * API.
 */
export type PolymarketAuth = {
  type: 'CUSTOM';
  /**
   * Wallet EOA private key — 32 bytes of hex, with or without a `0x`
   * prefix. Required for every CLOB trading method.
   */
  privateKey: string;
  /**
   * The proxy/funding wallet that holds USDC and appears as `maker` on
   * every signed order — NEVER the signer EOA itself. Required for order
   * placement; irrelevant for read-only CLOB calls (balance, tick-size,
   * ...).
   */
  funder?: string;
  /** @default {@link SIG_TYPE_POLY_PROXY} */
  signatureType?: number;
  /** @default {@link POLYGON_CHAIN_ID} */
  chainId?: number;
  /** Already-derived L2 API credentials, if you have them — skips the one-time {@link Polymarket.deriveApiCredentials} call. */
  apiCredentials?: ClobApiCredentials;
  /**
   * Relayer API credentials — a SEPARATE credential from `apiCredentials`
   * (the CLOB's L2 key), obtained independently from Polymarket. Both
   * required for {@link Polymarket.split}/{@link Polymarket.merge}/
   * {@link Polymarket.redeem}; irrelevant for CLOB trading.
   */
  relayerApiKey?: string;
  /** Must match `relayerApiKey`'s owner address. */
  relayerApiKeyAddress?: string;
};

/**
 * Options for configuring a {@link Polymarket} client. `baseURL` (inherited
 * from `RESTlerOptions`) defaults to the Gamma API — Gamma is this
 * connect's default host since it's the auth-free half of the API; CLOB
 * calls override it per-request (see `clobBaseURL`). Pass an explicit
 * `baseURL` only to point Gamma somewhere non-default (e.g. a mock server
 * in tests).
 */
export type PolymarketOptions = Omit<RESTlerOptions, 'auth'> & {
  /** CLOB trading credentials — omit for Gamma-only (public market data) usage. */
  auth?: PolymarketAuth;
  /** Override the CLOB API host (default: production). */
  clobBaseURL?: string;
  /** Override the Relayer API host (default: production). */
  relayerBaseURL?: string;
  /** Override the Data API host (default: production). */
  dataBaseURL?: string;
};

/** Filters for {@link Polymarket.getOpenOrders}. */
export type GetOpenOrdersOptions = {
  /** Only this order id. */
  id?: string;
  /** Condition id. */
  market?: string;
  /** Token id. */
  assetId?: string;
  /** `nextCursor` from the previous page. */
  cursor?: string;
};

/** Filters for {@link Polymarket.getFills}. */
export type GetFillsOptions = {
  /** Only this trade id. */
  id?: string;
  /** Condition id. */
  market?: string;
  /** Token id. */
  assetId?: string;
  /** Restrict to trades where this address was the maker. */
  makerAddress?: string;
  /** Unix seconds — only trades before this time. */
  before?: number;
  /** Unix seconds — only trades after this time. */
  after?: number;
  /** `nextCursor` from the previous page. */
  cursor?: string;
};

/** Filters for {@link Polymarket.getPositions}. */
export type GetPositionsOptions = {
  /** Wallet to read. Defaults to `auth.funder` (the proxy wallet that holds positions). */
  user?: string;
  /** Condition id(s) to restrict to. Mutually exclusive with `eventId`. */
  market?: string | string[];
  /** Event id(s) to restrict to. Mutually exclusive with `market`. */
  eventId?: string | string[];
  /** Hide positions smaller than this many shares. Vendor default `1`. */
  sizeThreshold?: number;
  /** Only positions in markets resolved in the held outcome's favour. */
  redeemable?: boolean;
  /** Only positions where both outcomes are held. */
  mergeable?: boolean;
  /** Vendor default 100. */
  limit?: number;
  offset?: number;
  sortBy?:
    | 'CURRENT'
    | 'INITIAL'
    | 'TOKENS'
    | 'CASHPNL'
    | 'PERCENTPNL'
    | 'TITLE'
    | 'RESOLVING'
    | 'PRICE'
    | 'AVGPRICE';
  sortDirection?: 'ASC' | 'DESC';
  /** Case-insensitive market-title filter. */
  title?: string;
};

/** Filters for {@link Polymarket.getMarkets}. */
export type GetMarketsOptions = {
  /**
   * `'keyset'` (cursor-paginated, supports `startDateMin`/`Max`, no
   * documented result-count cap) or `'legacy'` (offset-paginated, capped
   * around 8000 results, but the only one that honours `endDateMin`
   * correctly).
   * @default 'legacy'
   */
  endpoint?: 'keyset' | 'legacy';
  /** `false` (default) returns only open markets; `true` returns closed markets. */
  closed?: boolean;
  /** Results per page. Vendor default ~100; caps vary by endpoint. */
  limit?: number;
  /** @default 'startDate' */
  orderBy?: 'startDate' | 'endDate';
  /** @default true */
  ascending?: boolean;
  /** ISO-8601. Filter to markets whose `endDate >= this`. Only honoured by the `'legacy'` endpoint. */
  endDateMin?: string;
  endDateMax?: string;
  /** ISO-8601. Only honoured by the `'keyset'` endpoint. */
  startDateMin?: string;
  startDateMax?: string;
  /** Server-side filter to exact condition ids. */
  conditionIds?: string[];
  /** `'keyset'` pagination cursor from a previous call's {@link GetMarketsResult.nextCursor}. */
  cursor?: string;
  /** `'legacy'` pagination offset. */
  offset?: number;
};

/** One page of {@link Polymarket.getMarkets}. */
export type GetMarketsResult = {
  markets: GammaMarket[];
  /** Present only for the `'keyset'` endpoint, and only when a further page exists. */
  nextCursor?: string;
};

/** Inputs to {@link Polymarket.submitOrder}. */
export type SubmitOrderOptions = {
  /** CLOB ERC-1155 token id (decimal string) — from a Gamma market's `clobTokenIds`. */
  tokenId: string;
  side: OrderSide;
  /** On-tick, `[0.01, 0.99]`. */
  price: number;
  /** Cent-aligned — see {@link quantizeBuy}. */
  shares: number;
  orderType: 'GTC' | 'GTD' | 'FOK' | 'FAK';
  /** Unix SECONDS the order auto-cancels at. REQUIRED for `orderType: 'GTD'` (a GTD order with no expiration would silently behave exactly like GTC); ignored for GTC/FOK/FAK. */
  expirationTime?: number;
  /** Looked up via {@link Polymarket.getNegRisk} when omitted. */
  negRisk?: boolean;
  /** Looked up via {@link Polymarket.getVersion} when omitted. */
  version?: ProtocolVersion;
  /** Order must rest on the book and not match immediately. Only valid for GTC/GTD. @default false */
  postOnly?: boolean;
  /** @default false */
  deferExec?: boolean;
};

/** Inputs to {@link Polymarket.submitOrders} — one order; `version` is resolved once for the whole batch, not per-order. */
export type BulkOrderInput = Omit<SubmitOrderOptions, 'version'>;

/** Discriminant for {@link Polymarket.order} — the CLOB's `OrderSide` plus the Relayer's collateral actions. */
export type OrderAction = OrderSide | 'SPLIT' | 'MERGE' | 'REDEEM';

/**
 * Inputs to {@link Polymarket.order} — a single entry point that dispatches
 * to {@link Polymarket.submitOrder}/{@link Polymarket.split}/
 * {@link Polymarket.merge}/{@link Polymarket.redeem} based on `action`,
 * always returning an {@link OrderResult}.
 */
export type OrderRequest =
  | ({ action: OrderSide } & Omit<SubmitOrderOptions, 'side'>)
  | ({ action: 'SPLIT' | 'MERGE' } & {
    conditionId: string;
    amountUsd: number;
    negRisk: boolean;
  })
  | ({ action: 'REDEEM' } & { conditionId: string; negRisk: boolean });

/**
 * Convenience result of every trading/collateral action —
 * {@link Polymarket.submitOrder}/{@link Polymarket.submitOrders}/
 * {@link Polymarket.split}/{@link Polymarket.merge}/{@link Polymarket.redeem}/
 * {@link Polymarket.order} all resolve to this same shape, whichever vendor
 * endpoint actually ran.
 */
export type OrderResult = {
  /** Which action produced this result. */
  action: OrderAction;
  /** `true` when this action completed: a confirmed CLOB fill, or a Relayer action accepted for broadcast. */
  success: boolean;
  /** `true` only for a confirmed CLOB taker fill: `makingAmount > 0` and `status` case-insensitively `"matched"`. Always `false` for SPLIT/MERGE/REDEEM — there is no partial-fill concept on the Relayer. */
  filled: boolean;
  /** `true` when the CLOB answered "no match" for a FAK/FOK order — expected, not an error. Always `false` for SPLIT/MERGE/REDEEM. */
  noMatch: boolean;
  /**
   * `true` when this order was rejected for a reason other than a graceful
   * no-match. Only ever set by {@link Polymarket.submitOrders} — a single
   * {@link Polymarket.submitOrder} throws `ORDER_REJECTED` instead, since a
   * single call has no "the other N orders still went through" to preserve.
   * Always `false` for SPLIT/MERGE/REDEEM, which throw on rejection instead.
   */
  rejected: boolean;
  /** The vendor's rejection detail, present when `rejected` is `true`. */
  detail?: string;
  /** The CLOB order id, or the Relayer transaction id. */
  id: string;
  status: string;
  /** BUY/SELL only — the `price` requested. */
  requestedPrice?: number;
  /** BUY/SELL only — the effective per-share execution price actually achieved, once `filled`. */
  actualPrice?: number;
  /**
   * `requestedPrice - actualPrice` for a filled BUY/SELL order. `0` for
   * SPLIT/MERGE/REDEEM (a 1:1 collateral conversion has no price to slip
   * on) and for an unfilled/rejected order (nothing executed to compare).
   */
  slippage: number;
  /** HUMAN units (whole USDC/shares) — the venue does not return the 1e6 fixed-point wire form. For SPLIT/MERGE, both equal the requested `amountUsd`; for REDEEM, both `0` (the redeemed amount isn't known client-side — it's whatever balance the account holds on-chain). */
  makingAmount: number;
  takingAmount: number;
  /** `200` for a Relayer action (a non-2xx throws before this is constructed). */
  httpStatus: number;
  raw: ClobPostOrderResponse | RelayerSubmitResponse;
};

/**
 * Polymarket client — Gamma (public market discovery) and CLOB (trading)
 * REST APIs.
 *
 * Gamma methods need no `auth` at all. CLOB methods need `auth.privateKey`
 * (this client signs with it directly — L1 credential derivation and every
 * order are real secp256k1/EIP-712 signatures, not delegated elsewhere);
 * order placement additionally needs `auth.funder`. The Relayer's gasless
 * collateral actions ({@link split}/{@link merge}/{@link redeem}) further
 * need `auth.relayerApiKey`/`auth.relayerApiKeyAddress`. The WebSocket
 * market/user feeds are out of scope for this connect; see the README.
 *
 * @example
 * ```typescript
 * import { Polymarket } from '@tundraconnect/polymarket';
 *
 * // Gamma only — no wallet needed.
 * const gamma = new Polymarket({});
 * const markets = await gamma.getMarkets({ closed: false });
 *
 * // CLOB trading.
 * const clob = new Polymarket({
 *   auth: { type: 'CUSTOM', privateKey: 'YOUR_KEY', funder: 'YOUR_PROXY_ADDRESS' },
 * });
 * await clob.deriveApiCredentials();
 * const balance = await clob.getBalance();
 * ```
 */
export class Polymarket extends RESTler<PolymarketOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Polymarket';

  private readonly __clobBaseURL: string;
  private readonly __relayerBaseURL: string;
  private readonly __dataBaseURL: string;
  private readonly __chainId: number;
  private readonly __signatureType: number;
  private __signer?: PolymarketSigner;
  private __funder?: `0x${string}`;
  private __apiCreds?: ClobApiCredentials;
  private __relayerApiKey?: string;
  private __relayerApiKeyAddress?: string;

  private __versionCache?: ProtocolVersion;
  private readonly __tickCache = new Map<string, number>();
  private readonly __negRiskCache = new Map<string, boolean>();

  /**
   * Creates a Polymarket client.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - CLOB trading credentials — see {@link PolymarketOptions}.
   * @throws {PolymarketError} `CONFIG_INVALID_PRIVATE_KEY` or `CONFIG_INVALID_FUNDER`
   * when `auth` is supplied but malformed.
   */
  constructor(options: EventOptionKeys<PolymarketOptions, RESTlerEvents> = {}) {
    super(options as PolymarketOptions, {
      baseURL: GAMMA_API,
      timeout: 15,
      contentType: 'JSON',
    });
    this.__clobBaseURL = options.clobBaseURL ?? CLOB_API;
    this.__relayerBaseURL = options.relayerBaseURL ?? RELAYER_API;
    this.__dataBaseURL = options.dataBaseURL ?? DATA_API;
    this._responseHandler = (response) => this.__toError(response);

    const auth = options.auth;
    if (auth) {
      try {
        this.__signer = new PolymarketSigner(auth.privateKey);
      } catch (cause) {
        throw new PolymarketError(
          'CONFIG_INVALID_PRIVATE_KEY',
          {},
          cause instanceof Error ? cause : undefined,
        );
      }
      if (auth.funder !== undefined) {
        try {
          this.__funder = checksumAddress(auth.funder);
        } catch (cause) {
          throw new PolymarketError(
            'CONFIG_INVALID_FUNDER',
            { funder: auth.funder },
            cause instanceof Error ? cause : undefined,
          );
        }
      }
      this.__chainId = auth.chainId ?? POLYGON_CHAIN_ID;
      this.__signatureType = auth.signatureType ?? SIG_TYPE_POLY_PROXY;
      this.__apiCreds = auth.apiCredentials;
      this.__relayerApiKey = auth.relayerApiKey;
      this.__relayerApiKeyAddress = auth.relayerApiKeyAddress;
    } else {
      this.__chainId = POLYGON_CHAIN_ID;
      this.__signatureType = SIG_TYPE_POLY_PROXY;
    }
  }

  /** Checksummed signer EOA address, once `auth` is configured. Safe to display for operator confirmation. */
  get signerAddress(): string | undefined {
    return this.__signer?.address;
  }

  /** `true` once L2 API credentials are available (constructed-with, or derived via {@link deriveApiCredentials}). */
  get hasApiCredentials(): boolean {
    return this.__apiCreds !== undefined;
  }

  /** `true` once Relayer credentials are configured — required for {@link split}/{@link merge}/{@link redeem}. */
  get hasRelayerCredentials(): boolean {
    return this.__relayerApiKey !== undefined &&
      this.__relayerApiKeyAddress !== undefined;
  }

  // ── Gamma (public, no auth) ─────────────────────────────────────────────

  /**
   * Fetch one page of markets from Gamma.
   *
   * @throws {PolymarketError} `RESPONSE_ERROR` when the body fails validation.
   *
   * @example
   * ```typescript
   * const { markets, nextCursor } = await client.getMarkets({
   *   endpoint: 'keyset',
   *   closed: false,
   * });
   * ```
   */
  public async getMarkets(
    options: GetMarketsOptions = {},
  ): Promise<GetMarketsResult> {
    const usesKeyset = options.endpoint === 'keyset';
    const query: Record<string, string> = {
      closed: String(options.closed ?? false),
      order: options.orderBy ?? 'startDate',
      ascending: String(options.ascending ?? true),
    };
    if (options.limit !== undefined) query.limit = String(options.limit);
    if (options.endDateMin) query.end_date_min = options.endDateMin;
    if (options.endDateMax) query.end_date_max = options.endDateMax;
    if (options.startDateMin) query.start_date_min = options.startDateMin;
    if (options.startDateMax) query.start_date_max = options.startDateMax;
    if (options.conditionIds?.length) {
      query.condition_ids = options.conditionIds.join(',');
    }
    if (usesKeyset && options.cursor) query.after_cursor = options.cursor;
    if (!usesKeyset && options.offset) query.offset = String(options.offset);

    if (usesKeyset) {
      const page = await this.__requestAndValidate(
        { path: '/markets/keyset', method: 'GET', query },
        GammaMarketKeysetPageSchemaObject,
      );
      return {
        markets: page.markets,
        nextCursor: page.nextCursor || undefined,
      };
    }
    const markets = await this.__requestAndValidate(
      { path: '/markets', method: 'GET', query },
      GammaMarketListSchemaObject,
    );
    return { markets };
  }

  /**
   * Fetch one market by its exact slug.
   *
   * @returns The market, or `null` when no market has that slug.
   * @throws {PolymarketError} `RESPONSE_ERROR` when the body fails validation.
   *
   * @example
   * ```typescript
   * const market = await client.getMarketBySlug('btc-updown-5m-1732012800');
   * ```
   */
  public async getMarketBySlug(slug: string): Promise<GammaMarket | null> {
    try {
      return await this.__requestAndValidate(
        { path: `/markets/slug/${encodeURIComponent(slug)}`, method: 'GET' },
        GammaMarketSchemaObject,
      );
    } catch (err) {
      if (err instanceof PolymarketError && err.code === 'NOT_FOUND') {
        return null;
      }
      throw err;
    }
  }

  // ── CLOB: public (unauthenticated) ──────────────────────────────────────

  /**
   * The CLOB's active order-signing protocol version (`1` or `2`), cached
   * for the lifetime of this instance. `force: true` refreshes the cache —
   * used after the venue reports `order_version_mismatch`.
   *
   * @throws {PolymarketError} `RESPONSE_ERROR` when the body fails validation, or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR` from the vendor.
   */
  public async getVersion(force = false): Promise<ProtocolVersion> {
    if (!force && this.__versionCache !== undefined) return this.__versionCache;
    const result = await this.__requestAndValidate(
      { path: '/version', baseURL: this.__clobBaseURL, method: 'GET' },
      ClobVersionSchemaObject,
    );
    const version: ProtocolVersion = result.version === 1 ? 1 : 2;
    this.__versionCache = version;
    return version;
  }

  /**
   * Minimum price tick for `tokenId` (`0.1`/`0.01`/`0.001`/`0.0001`), cached per token.
   *
   * @throws {PolymarketError} `NOT_FOUND` for an unknown token; `RESPONSE_ERROR` when the body fails validation; or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   */
  public async getTickSize(tokenId: string): Promise<number> {
    const cached = this.__tickCache.get(tokenId);
    if (cached !== undefined) return cached;
    const result = await this.__requestAndValidate(
      {
        path: '/tick-size',
        baseURL: this.__clobBaseURL,
        method: 'GET',
        query: { token_id: tokenId },
      },
      ClobTickSizeSchemaObject,
    );
    this.__tickCache.set(tokenId, result.minimumTickSize);
    return result.minimumTickSize;
  }

  /**
   * Whether `tokenId` trades on the neg-risk exchange (changes only the order's `verifyingContract`), cached per token.
   *
   * @throws {PolymarketError} `NOT_FOUND` for an unknown token; `RESPONSE_ERROR` when the body fails validation; or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   */
  public async getNegRisk(tokenId: string): Promise<boolean> {
    const cached = this.__negRiskCache.get(tokenId);
    if (cached !== undefined) return cached;
    const result = await this.__requestAndValidate(
      {
        path: '/neg-risk',
        baseURL: this.__clobBaseURL,
        method: 'GET',
        query: { token_id: tokenId },
      },
      ClobNegRiskSchemaObject,
    );
    this.__negRiskCache.set(tokenId, result.negRisk);
    return result.negRisk;
  }

  /**
   * The public aggregated order book for one outcome token (`GET /book`).
   * Levels keep the vendor's ordering — bids ascending and asks
   * descending by price, so the touch is `bids.at(-1)` / `asks.at(-1)`.
   *
   * @throws {PolymarketError} `NOT_FOUND` for an unknown token; `RESPONSE_ERROR` when the body fails validation; or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const book = await client.getOrderbook(tokenId);
   * console.log('best bid', book.bids.at(-1)?.price, 'best ask', book.asks.at(-1)?.price);
   * ```
   */
  public async getOrderbook(tokenId: string): Promise<ClobOrderBook> {
    return await this.__requestAndValidate(
      {
        path: '/book',
        baseURL: this.__clobBaseURL,
        method: 'GET',
        query: { token_id: tokenId },
      },
      ClobOrderBookSchemaObject,
    );
  }

  /**
   * Connection keepalive — `GET` on the CLOB API root. Returns `false` on any failure rather than throwing.
   *
   * @throws Never — every failure, vendor or transport, resolves to `false`. Documented explicitly so the absence of a throw is visibly deliberate.
   */
  public async keepalive(): Promise<boolean> {
    try {
      const response = await this._makeRequest(
        { path: '/', baseURL: this.__clobBaseURL, method: 'GET' },
        { responseHandler: (r) => r.body },
      );
      const status = response.status ?? 0;
      return status >= 200 && status < 300;
    } catch {
      return false;
    }
  }

  // ── CLOB: L1 (credential derivation) ────────────────────────────────────

  /**
   * Derive (or create) the L2 API credentials via a one-time L1 EIP-712
   * signature. No-op — returns the existing credentials — if `auth` was
   * constructed with `apiCredentials` already set or this was already
   * called once.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` when `auth` was
   * not configured at construction.
   */
  public async deriveApiCredentials(nonce = 0): Promise<ClobApiCredentials> {
    if (this.__apiCreds) return this.__apiCreds;
    const signer = this.__requireSigner();
    const timestampSec = Math.floor(Date.now() / 1000);
    const headers = buildL1Headers(signer, this.__chainId, timestampSec, nonce);

    try {
      const created = await this.__requestAndValidate(
        {
          path: '/auth/api-key',
          baseURL: this.__clobBaseURL,
          method: 'POST',
          headers,
        },
        ClobApiCredentialsSchemaObject,
      );
      this.__apiCreds = created;
      return created;
    } catch (err) {
      // Fall back to derive-api-key ONLY for the one case it actually
      // fixes: the vendor's "key already exists for this wallet+nonce"
      // rejection, a 400 -> INVALID_REQUEST. Any other failure (a bad L1
      // signature -> 401 AUTH_FAILED, a 429/5xx, a network error) would
      // fail the fallback identically (same signed headers, same signer),
      // so falling back there would only replace a diagnostic error with a
      // less specific one — rethrow instead.
      if (!(err instanceof PolymarketError) || err.code !== 'INVALID_REQUEST') {
        throw err;
      }
      const derived = await this.__requestAndValidate(
        {
          path: '/auth/derive-api-key',
          baseURL: this.__clobBaseURL,
          method: 'GET',
          headers,
        },
        ClobApiCredentialsSchemaObject,
      );
      this.__apiCreds = derived;
      return derived;
    }
  }

  // ── CLOB: L2 (authenticated) ────────────────────────────────────────────

  /**
   * Available balance as the venue sees it — the number the CLOB actually
   * checks before accepting an order, not an on-chain read. With no
   * `tokenId` this is the USDC collateral balance; with one it is the
   * share balance of that outcome token (what a SELL can draw on).
   *
   * @param options.tokenId - Outcome token id for a share balance; omit for USDC.
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`.
   *
   * @example
   * ```typescript
   * const { balance } = await client.getBalance(); // USDC, e.g. 125.5
   * const shares = await client.getBalance({ tokenId }); // shares of one outcome
   * ```
   */
  public async getBalance(
    options: { tokenId?: string } = {},
  ): Promise<ClobBalance> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    const query: Record<string, string> = {
      asset_type: options.tokenId ? 'CONDITIONAL' : 'COLLATERAL',
      signature_type: String(this.__signatureType),
    };
    if (options.tokenId) query.token_id = options.tokenId;
    return await this.__requestAndValidate(
      {
        path: '/balance-allowance',
        baseURL: this.__clobBaseURL,
        method: 'GET',
        query,
        auth: this.__l2Auth(signer, creds),
      },
      ClobBalanceSchemaObject,
    );
  }

  /**
   * The account's orders on the venue — resting ones by default, plus
   * recently settled ones the venue still lists — for restart
   * reconciliation or checking on a resting order. One page per call;
   * pass `nextCursor` back as `cursor` for the next.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`;
   * `RESPONSE_ERROR` when the body fails validation; or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * let cursor: string | undefined;
   * do {
   *   const page = await client.getOpenOrders({ market: conditionId, cursor });
   *   for (const order of page.data) console.log(order.id, order.status, order.price);
   *   cursor = page.nextCursor;
   * } while (cursor);
   * ```
   */
  public async getOpenOrders(
    options: GetOpenOrdersOptions = {},
  ): Promise<ClobOpenOrdersPage> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    const query: Record<string, string> = {};
    if (options.id) query.id = options.id;
    if (options.market) query.market = options.market;
    if (options.assetId) query.asset_id = options.assetId;
    if (options.cursor) query.next_cursor = options.cursor;
    return await this.__requestAndValidate(
      {
        path: '/data/orders',
        baseURL: this.__clobBaseURL,
        method: 'GET',
        query,
        auth: this.__l2Auth(signer, creds),
      },
      ClobOpenOrdersPageSchemaObject,
    );
  }

  /**
   * The account's own executions (fills), newest first. One page per
   * call; pass `nextCursor` back as `cursor` for the next.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`;
   * `RESPONSE_ERROR` when the body fails validation; or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const { data: fills } = await client.getFills({ market: conditionId, after: sinceUnix });
   * for (const fill of fills) console.log(fill.side, fill.size, fill.price, fill.traderSide);
   * ```
   */
  public async getFills(
    options: GetFillsOptions = {},
  ): Promise<ClobTradesPage> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    const query: Record<string, string> = {};
    if (options.id) query.id = options.id;
    if (options.market) query.market = options.market;
    if (options.assetId) query.asset_id = options.assetId;
    if (options.makerAddress) query.maker_address = options.makerAddress;
    if (options.before !== undefined) query.before = String(options.before);
    if (options.after !== undefined) query.after = String(options.after);
    if (options.cursor) query.next_cursor = options.cursor;
    return await this.__requestAndValidate(
      {
        path: '/data/trades',
        baseURL: this.__clobBaseURL,
        method: 'GET',
        query,
        auth: this.__l2Auth(signer, creds),
      },
      ClobTradesPageSchemaObject,
    );
  }

  // ── Data API (public portfolio view) ────────────────────────────────────

  /**
   * Open positions of a wallet with mark-to-market value and PnL, from
   * the public Data API — no signing involved. Defaults to `auth.funder`
   * (the proxy wallet that actually holds positions), so a client built
   * with trading credentials reads its own book; pass `user` to read any
   * other wallet.
   *
   * Offset-paginated: the vendor returns up to `limit` (default 100) rows
   * starting at `offset`; a page shorter than `limit` is the last.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` when neither
   * `user` nor `auth.funder` is available; `RESPONSE_ERROR` when the body
   * fails validation; or `INVALID_REQUEST`/`RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const positions = await client.getPositions({ redeemable: true });
   * for (const p of positions) console.log(p.title, p.outcome, p.size, p.cashPnl);
   * ```
   */
  public async getPositions(
    options: GetPositionsOptions = {},
  ): Promise<DataPosition[]> {
    const user = options.user ?? this.__requireFunder();
    const query: Record<string, string> = { user };
    const list = (value: string | string[]) =>
      Array.isArray(value) ? value.join(',') : value;
    if (options.market !== undefined) query.market = list(options.market);
    if (options.eventId !== undefined) query.eventId = list(options.eventId);
    if (options.sizeThreshold !== undefined) {
      query.sizeThreshold = String(options.sizeThreshold);
    }
    if (options.redeemable !== undefined) {
      query.redeemable = String(options.redeemable);
    }
    if (options.mergeable !== undefined) {
      query.mergeable = String(options.mergeable);
    }
    if (options.limit !== undefined) query.limit = String(options.limit);
    if (options.offset !== undefined) query.offset = String(options.offset);
    if (options.sortBy) query.sortBy = options.sortBy;
    if (options.sortDirection) query.sortDirection = options.sortDirection;
    if (options.title) query.title = options.title;
    return await this.__requestAndValidate(
      {
        path: '/positions',
        baseURL: this.__dataBaseURL,
        method: 'GET',
        query,
      },
      DataPositionListSchemaObject,
    );
  }

  /**
   * Total mark-to-market value of a wallet's positions in USDC, from the
   * public Data API. Defaults to `auth.funder`; `market` narrows it to
   * one or more condition ids. Returns `0` for a wallet with no positions.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` when neither
   * `user` nor `auth.funder` is available; `RESPONSE_ERROR` when the body
   * fails validation; or `INVALID_REQUEST`/`RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const value = await client.getPortfolioValue();
   * const cash = (await client.getBalance()).balance;
   * console.log('equity', value + cash);
   * ```
   */
  public async getPortfolioValue(
    options: { user?: string; market?: string | string[] } = {},
  ): Promise<number> {
    const user = options.user ?? this.__requireFunder();
    const query: Record<string, string> = { user };
    if (options.market !== undefined) {
      query.market = Array.isArray(options.market)
        ? options.market.join(',')
        : options.market;
    }
    const values = await this.__requestAndValidate(
      {
        path: '/value',
        baseURL: this.__dataBaseURL,
        method: 'GET',
        query,
      },
      DataValueListSchemaObject,
    );
    return values[0]?.value ?? 0;
  }

  /**
   * Build, sign, and submit one marketable order. On `order_version_mismatch`
   * (the venue serving a different protocol version than cached), refreshes
   * the version and retries once — every other outcome (a fill, a partial
   * fill, a graceful FAK/FOK no-match, or a genuine rejection) is returned,
   * not retried.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`
   * when `auth`/derived credentials are missing, `CONFIG_MISSING_PRIVATE_KEY`
   * (reused) when `auth.funder` was not set, `ORDER_VERSION_MISMATCH_PERSISTED`
   * when the mismatch survives one retry, or `ORDER_REJECTED` for any other
   * non-2xx response.
   *
   * @example
   * ```typescript
   * const result = await client.submitOrder({
   *   tokenId: '7132...',
   *   side: 'BUY',
   *   price: 0.55,
   *   shares: 9.0,
   *   orderType: 'FAK',
   * });
   * if (result.filled) console.log(result.makingAmount, result.takingAmount);
   * ```
   */
  public async submitOrder(
    options: SubmitOrderOptions,
  ): Promise<OrderResult> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    const funder = this.__requireFunder();
    Polymarket.__validateOrderInput(options);

    const [version, negRisk] = await Promise.all([
      options.version !== undefined
        ? Promise.resolve(options.version)
        : this.getVersion(),
      options.negRisk !== undefined
        ? Promise.resolve(options.negRisk)
        : this.getNegRisk(options.tokenId),
    ]);

    const attempt = async (
      protocolVersion: ProtocolVersion,
    ): Promise<
      { response: RESTlerResponse<unknown>; parsed: ClobPostOrderResponse }
    > => {
      const payload = this.__buildOrderPayload(
        signer,
        funder,
        protocolVersion,
        negRisk,
        options,
        creds.apiKey,
      );
      return await this.__requestOrderResponse<ClobPostOrderResponse>(
        {
          path: '/order',
          baseURL: this.__clobBaseURL,
          method: 'POST',
          contentType: 'JSON',
          payload,
          auth: this.__l2Auth(signer, creds),
        },
        (data) => ClobPostOrderResponseSchemaObject.parse(data),
      );
    };

    let { response, parsed } = await attempt(version);
    if (this.__isVersionMismatch(response, parsed)) {
      const freshVersion = await this.getVersion(true);
      ({ response, parsed } = await attempt(freshVersion));
      if (this.__isVersionMismatch(response, parsed)) {
        throw new PolymarketError('ORDER_VERSION_MISMATCH_PERSISTED', {
          status: response.status,
        });
      }
    }

    return this.__toSubmitOrderResult(
      response,
      parsed,
      options.side,
      options.price,
    );
  }

  /**
   * Build, sign, and submit up to {@link BULK_ORDER_CHUNK_SIZE} orders per
   * `POST /orders` call — larger inputs are chunked automatically, every
   * chunk submitted concurrently. A VENDOR-side rejection of one order
   * never throws and never discards any other order's outcome, in this
   * chunk or any other — each input maps to exactly one result, in the
   * same order, with `rejected`/`detail` set instead. This includes a
   * whole-chunk rejection (e.g. more than 15 orders, or an owner/signer
   * mismatch) and a version mismatch that survives its retry — both are
   * reported as per-row `rejected: true` results, never a thrown
   * exception, so one bad chunk can never discard another chunk's
   * genuine results.
   *
   * Unlike `submitOrder`, this never throws `ORDER_VERSION_MISMATCH_PERSISTED`
   * — a persisted mismatch is a per-row rejection here, for the same reason.
   *
   * A LOCALLY-refused order (currently: a `GTD` order missing
   * `expirationTime`) is different — it refuses the WHOLE batch before
   * any request is sent, rather than silently dropping just that one
   * order, since it usually means a bug in how the caller built the
   * batch rather than a per-order business decision the venue made.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`,
   * `ORDER_REJECTED` for a locally-refused order (checked before any
   * request is sent).
   *
   * @example
   * ```typescript
   * const results = await client.submitOrders([
   *   { tokenId, side: 'BUY', price: 0.55, shares: 9, orderType: 'GTC' },
   *   { tokenId: otherTokenId, side: 'SELL', price: 0.4, shares: 5, orderType: 'GTC' },
   * ]);
   * for (const r of results) {
   *   if (r.rejected) console.log('rejected:', r.detail);
   * }
   * ```
   */
  public async submitOrders(
    orders: readonly BulkOrderInput[],
  ): Promise<OrderResult[]> {
    if (orders.length === 0) return [];
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    const funder = this.__requireFunder();
    for (const order of orders) Polymarket.__validateOrderInput(order);

    // Dedupe per-token lookups: a batch commonly reuses the same tokenId
    // across several orders (e.g. resting GTC legs at different price
    // levels), and firing one /neg-risk request per ORDER rather than per
    // unique TOKEN would multiply that out for no reason — getNegRisk's own
    // cache can't help here since concurrent calls all miss it before the
    // first one resolves. Independent of the version lookup below, so both
    // run concurrently rather than paying two round-trips back to back.
    const uncachedTokenIds = [
      ...new Set(
        orders.filter((order) => order.negRisk === undefined).map((order) =>
          order.tokenId
        ),
      ),
    ];
    const negRiskByToken = new Map<string, boolean>();
    const [version] = await Promise.all([
      this.getVersion(),
      Promise.all(
        uncachedTokenIds.map(async (tokenId) => {
          negRiskByToken.set(tokenId, await this.getNegRisk(tokenId));
        }),
      ),
    ]);
    const negRisks = orders.map((order) =>
      order.negRisk ?? negRiskByToken.get(order.tokenId)!
    );

    const chunks: Array<
      { chunk: readonly BulkOrderInput[]; negRisks: readonly boolean[] }
    > = [];
    for (let i = 0; i < orders.length; i += BULK_ORDER_CHUNK_SIZE) {
      chunks.push({
        chunk: orders.slice(i, i + BULK_ORDER_CHUNK_SIZE),
        negRisks: negRisks.slice(i, i + BULK_ORDER_CHUNK_SIZE),
      });
    }
    // Chunks are independent requests — submit them concurrently rather
    // than one at a time; wall-clock is bounded by the slowest chunk, not
    // their sum. __submitOrderChunk never throws for a vendor-side
    // rejection (see this method's doc comment), so one chunk's failure
    // can never prevent another's results from coming back.
    const chunkResults = await Promise.all(
      chunks.map(({ chunk, negRisks: chunkNegRisks }) =>
        this.__submitOrderChunk(
          signer,
          creds,
          funder,
          version,
          chunk,
          chunkNegRisks,
        )
      ),
    );
    return chunkResults.flat();
  }

  /**
   * Cancel one resting order by id.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`.
   */
  public async cancelOrder(orderId: string): Promise<ClobCancelResponse> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    return await this.__requestAndValidate(
      this.__deleteWithBody(
        '/order',
        { orderID: orderId },
        this.__l2Auth(signer, creds),
      ),
      ClobCancelResponseSchemaObject,
    );
  }

  /**
   * Cancel a batch of resting orders by id.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`.
   */
  public async cancelOrders(orderIds: string[]): Promise<ClobCancelResponse> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    return await this.__requestAndValidate(
      this.__deleteWithBody('/orders', orderIds, this.__l2Auth(signer, creds)),
      ClobCancelResponseSchemaObject,
    );
  }

  /**
   * Cancel every resting order for a market and/or a specific token.
   * At least one of `market`/`assetId` must be set.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`.
   *
   * @example
   * ```typescript
   * // Every resting order across both outcomes of one market.
   * await client.cancelMarketOrders({ market: conditionId });
   * // Just one outcome token within it.
   * await client.cancelMarketOrders({ market: conditionId, assetId: tokenId });
   * ```
   */
  public async cancelMarketOrders(
    options: { market?: string; assetId?: string },
  ): Promise<ClobCancelResponse> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    const payload: Record<string, string> = {};
    if (options.market) payload.market = options.market;
    if (options.assetId) payload.asset_id = options.assetId;
    return await this.__requestAndValidate(
      this.__deleteWithBody(
        '/cancel-market-orders',
        payload,
        this.__l2Auth(signer, creds),
      ),
      ClobCancelResponseSchemaObject,
    );
  }

  /**
   * Cancel EVERY resting order on the account, across all markets, in one
   * request (`DELETE /cancel-all`). The kill switch — prefer
   * {@link cancelMarketOrders} when only one market needs flattening.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`.
   *
   * @example
   * ```typescript
   * const { canceled, notCanceled } = await client.cancelAllOrders();
   * ```
   */
  public async cancelAllOrders(): Promise<ClobCancelResponse> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    return await this.__requestAndValidate(
      {
        path: '/cancel-all',
        baseURL: this.__clobBaseURL,
        method: 'DELETE',
        auth: this.__l2Auth(signer, creds),
      },
      ClobCancelResponseSchemaObject,
    );
  }

  // ── Relayer (gasless split/merge/redeem) ────────────────────────────────

  /**
   * SPLIT: convert `amountUsd` of pUSD collateral into `amountUsd` shares
   * of EACH outcome (e.g. both UP and DOWN), gasless — the relayer pays
   * gas, funded from `auth.funder`'s own on-chain collateral.
   *
   * This moves real, on-chain funds and cannot be undone by this connect;
   * review `PolymarketRelayer.ts` yourself before trusting it with real
   * money — see the README's "Key custody" section.
   *
   * @param negRisk - `false` for a binary (non-neg-risk) market — pass
   * {@link getNegRisk} for the market's token if unsure.
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` (also thrown
   * when `auth.funder` is unset) / `CONFIG_MISSING_RELAYER_CREDENTIALS`.
   */
  public async split(
    options: { conditionId: string; amountUsd: number; negRisk: boolean },
  ): Promise<OrderResult> {
    const tx = buildSplitTx(
      options.conditionId,
      options.amountUsd,
      options.negRisk,
    );
    return await this.__submitRelayerTx('SPLIT', tx, options.amountUsd);
  }

  /**
   * MERGE: the inverse of {@link split} — burns `amountUsd` of each
   * outcome pair and returns `amountUsd` pUSD. Same routing/risk notes as
   * `split`.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `CONFIG_MISSING_RELAYER_CREDENTIALS`.
   */
  public async merge(
    options: { conditionId: string; amountUsd: number; negRisk: boolean },
  ): Promise<OrderResult> {
    const tx = buildMergeTx(
      options.conditionId,
      options.amountUsd,
      options.negRisk,
    );
    return await this.__submitRelayerTx('MERGE', tx, options.amountUsd);
  }

  /**
   * REDEEM: convert the full held balance of a RESOLVED market's outcome
   * shares back to pUSD (winning shares pay $1 each, losing $0). Same
   * routing/risk notes as `split`.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `CONFIG_MISSING_RELAYER_CREDENTIALS`.
   */
  public async redeem(
    options: { conditionId: string; negRisk: boolean },
  ): Promise<OrderResult> {
    const tx = buildRedeemTx(options.conditionId, options.negRisk);
    return await this.__submitRelayerTx('REDEEM', tx, 0);
  }

  /**
   * Single entry point for every trading/collateral action — dispatches to
   * {@link submitOrder} (BUY/SELL) or {@link split}/{@link merge}/
   * {@link redeem} (SPLIT/MERGE/REDEEM) based on `request.action`, so
   * callers that build requests generically don't need a per-action
   * branch of their own. Returns the same {@link OrderResult} shape
   * regardless of which action ran.
   *
   * @example
   * ```typescript
   * const result = await client.order({
   *   action: 'BUY',
   *   tokenId,
   *   price: 0.55,
   *   shares: 9.0,
   *   orderType: 'FAK',
   * });
   * console.log(result.slippage);
   * ```
   *
   * @throws {PolymarketError} Whatever the dispatched action throws — see {@link submitOrder} for BUY/SELL and {@link split}/{@link merge}/{@link redeem} for the collateral actions; plus `REQUEST_VALIDATION_ERROR` for an unrecognized `action`.
   */
  public async order(request: OrderRequest): Promise<OrderResult> {
    switch (request.action) {
      case 'BUY':
      case 'SELL': {
        const { action, ...rest } = request;
        return await this.submitOrder({ ...rest, side: action });
      }
      case 'SPLIT':
      case 'MERGE': {
        const { action, ...rest } = request;
        return action === 'SPLIT'
          ? await this.split(rest)
          : await this.merge(rest);
      }
      case 'REDEEM': {
        const { action: _action, ...rest } = request;
        return await this.redeem(rest);
      }
      default:
        // Unreachable from typed callers; a plain-JS caller can still pass
        // anything, so name the action rather than fail anonymously.
        throw new PolymarketError('UNKNOWN_ERROR', {
          action: (request as { action?: unknown }).action,
        });
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * Builds a `RESTlerEndpoint`-shaped `DELETE` request carrying a JSON
   * body. `RESTlerMethodPayload`'s type models `DELETE` as body-less (most
   * vendors' `DELETE` never carries one) — the CLOB's cancel endpoints are
   * the exception (`DELETE /order` / `DELETE /orders` both require one),
   * and RESTler's runtime (`_buildBody`) does not actually restrict a body
   * to any particular method, only the type does. The cast below resolves
   * that type-only mismatch; the L2 HMAC still covers these exact bytes
   * via `_authInjector`, same as every other authenticated call.
   */
  private __deleteWithBody(
    path: string,
    payload: unknown,
    auth: RESTlerAuth,
  ): RESTlerEndpoint {
    return {
      path,
      baseURL: this.__clobBaseURL,
      method: 'DELETE',
      contentType: 'JSON',
      payload,
      auth,
    } as unknown as RESTlerEndpoint;
  }

  /** Per-call auth marker read by {@link _authInjector} — the actual signer/credentials live on instance state, not in this object. */
  private __l2Auth(
    signer: PolymarketSigner,
    creds: L2Credentials,
  ): RESTlerAuth {
    return {
      type: 'CUSTOM',
      clobAuthKind: 'L2',
      signerAddress: signer.address,
      creds,
    };
  }

  /**
   * The wallet signer built from `auth.privateKey`.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` when no `auth` was given.
   */
  private __requireSigner(): PolymarketSigner {
    if (!this.__signer) throw new PolymarketError('CONFIG_MISSING_PRIVATE_KEY');
    return this.__signer;
  }

  /**
   * The CLOB L2 API credentials, from `auth.apiCredentials` or
   * {@link deriveApiCredentials}.
   *
   * @throws {PolymarketError} `NO_API_CREDENTIALS` when neither has happened.
   */
  private __requireApiCreds(): ClobApiCredentials {
    if (!this.__apiCreds) throw new PolymarketError('NO_API_CREDENTIALS');
    return this.__apiCreds;
  }

  /**
   * The checksummed proxy/funder wallet orders are placed from.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` when `auth.funder`
   * was not set (the code is reused for this missing credential).
   */
  private __requireFunder(): `0x${string}` {
    if (!this.__funder) throw new PolymarketError('CONFIG_MISSING_PRIVATE_KEY');
    return this.__funder;
  }

  /**
   * The Relayer API key and its owner address, needed by
   * {@link split}/{@link merge}/{@link redeem}.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_RELAYER_CREDENTIALS`.
   */
  private __requireRelayerCredentials(): {
    relayerApiKey: string;
    relayerApiKeyAddress: string;
  } {
    if (!this.__relayerApiKey || !this.__relayerApiKeyAddress) {
      throw new PolymarketError('CONFIG_MISSING_RELAYER_CREDENTIALS');
    }
    return {
      relayerApiKey: this.__relayerApiKey,
      relayerApiKeyAddress: this.__relayerApiKeyAddress,
    };
  }

  /** Per-call auth marker read by {@link _authInjector} for the Relayer's plain (non-HMAC) header scheme. */
  private __relayerAuth(
    relayerApiKey: string,
    relayerApiKeyAddress: string,
  ): RESTlerAuth {
    return {
      type: 'CUSTOM',
      clobAuthKind: 'RELAYER',
      relayerApiKey,
      relayerApiKeyAddress,
    };
  }

  /**
   * Shared submit path for {@link split}/{@link merge}/{@link redeem}:
   * fetches a fresh relay payload (nonce + relay account), builds and
   * signs the proxy meta-tx envelope, posts it to the relay hub, and wraps
   * the result as an {@link OrderResult} — a non-2xx response throws
   * before this returns (via the shared `__toError` mapping), so reaching
   * the `return` below always means the relayer accepted the action.
   */
  private async __submitRelayerTx(
    action: 'SPLIT' | 'MERGE' | 'REDEEM',
    tx: ProxyTransaction,
    amountUsd: number,
  ): Promise<OrderResult> {
    const signer = this.__requireSigner();
    const funder = this.__requireFunder();
    const { relayerApiKey, relayerApiKeyAddress } = this
      .__requireRelayerCredentials();
    const relayerAuth = this.__relayerAuth(relayerApiKey, relayerApiKeyAddress);

    const relayPayload = await this.__requestAndValidate(
      {
        path: '/relay-payload',
        baseURL: this.__relayerBaseURL,
        method: 'GET',
        query: { address: signer.address, type: 'PROXY' },
        auth: relayerAuth,
      },
      RelayPayloadSchemaObject,
    );

    const envelope = buildProxyMetaTx(signer, [tx], relayPayload, funder);

    // Errors here flow through the same connect-wide __toError mapping as
    // every Gamma/CLOB call (INVALID_REQUEST/AUTH_FAILED/RATE_LIMITED/
    // SERVICE_UNAVAILABLE/UNKNOWN_ERROR) — the Relayer's documented status
    // codes (400/401/429/500) are already covered by that generic mapping,
    // so no Relayer-specific error handling is needed here.
    const result = await this.__requestAndValidate(
      {
        path: '/submit',
        baseURL: this.__relayerBaseURL,
        method: 'POST',
        contentType: 'JSON',
        payload: envelope,
        auth: relayerAuth,
      },
      RelayerSubmitResponseSchemaObject,
    );

    return {
      action,
      success: true,
      filled: false,
      noMatch: false,
      rejected: false,
      id: result.transactionId,
      status: result.state ?? '',
      slippage: 0,
      makingAmount: amountUsd,
      takingAmount: amountUsd,
      httpStatus: 200,
      raw: result,
    };
  }

  /**
   * Whether a non-2xx order response is the venue saying it now serves a
   * different order-signing protocol version (so the order should be
   * rebuilt and retried once), rather than a real rejection.
   */
  private __isVersionMismatch(
    response: RESTlerResponse<unknown>,
    parsed: ClobPostOrderResponse,
  ): boolean {
    if ((response.status ?? 0) >= 200 && (response.status ?? 0) < 300) {
      return false;
    }
    return (parsed.errorMsg ?? '').toLowerCase().includes(
      VERSION_MISMATCH_MARKER,
    );
  }

  /**
   * Maps an order-submission response to an {@link OrderResult}. A non-2xx
   * response is a graceful `noMatch` when the vendor reports an unmatched
   * FAK/FOK order, and otherwise throws.
   *
   * @throws {PolymarketError} `ORDER_REJECTED` for any other non-2xx
   * response.
   */
  private __toSubmitOrderResult(
    response: RESTlerResponse<unknown>,
    parsed: ClobPostOrderResponse,
    side: OrderSide,
    requestedPrice: number,
  ): OrderResult {
    const status = response.status ?? 0;
    const httpOk = status >= 200 && status < 300;
    const errorText = (parsed.errorMsg ?? '').toLowerCase();

    if (!httpOk) {
      const noMatch = errorText.includes(FAK_NO_MATCH_MARKER) ||
        errorText.includes(FOK_NO_MATCH_MARKER);
      if (!noMatch) {
        throw new PolymarketError('ORDER_REJECTED', {
          status,
          detail: parsed.errorMsg ?? 'unknown reason',
        });
      }
      return {
        action: side,
        success: false,
        filled: false,
        noMatch: true,
        rejected: false,
        id: parsed.orderId ?? '',
        status: `http-${status}`,
        requestedPrice,
        slippage: 0,
        makingAmount: 0,
        takingAmount: 0,
        httpStatus: status,
        raw: parsed,
      };
    }

    const makingAmount = Polymarket.__toAmount(parsed.makingAmount);
    const takingAmount = Polymarket.__toAmount(parsed.takingAmount);
    // the battle-tested fill rule: makingAmount > 0 AND status matched (case-insensitive)
    const filled = makingAmount > 0 &&
      (parsed.status ?? '').toLowerCase() === 'matched';
    const actualPrice = filled
      ? Polymarket.__effectivePrice(side, makingAmount, takingAmount)
      : undefined;
    return {
      action: side,
      success: filled,
      filled,
      noMatch: false,
      rejected: false,
      id: parsed.orderId ?? '',
      status: parsed.status ?? '',
      requestedPrice,
      actualPrice,
      slippage: actualPrice !== undefined
        ? Polymarket.__round6(requestedPrice - actualPrice)
        : 0,
      makingAmount,
      takingAmount,
      httpStatus: status,
      raw: parsed,
    };
  }

  /**
   * Validates fields the wire encoding can't honestly satisfy on its own,
   * before any network call. Called once upfront by {@link submitOrder}/
   * {@link submitOrders} (for every order in the batch) rather than
   * inside the per-order build step, so a doomed order — or a doomed
   * batch — is refused before wasting a version/neg-risk lookup.
   */
  private static __validateOrderInput(input: BulkOrderInput): void {
    if (input.orderType === 'GTD' && !input.expirationTime) {
      // Without this, a GTD order silently signs/sends expiration=0 (the
      // wire and, for V1, the SIGNED struct's default) and behaves exactly
      // like GTC — no error, no expiry, ever.
      throw new PolymarketError('ORDER_REJECTED', {
        detail:
          "orderType 'GTD' requires a positive expirationTime (Unix seconds)",
      });
    }
  }

  /**
   * Builds one order's signed wire payload — the shared step between
   * {@link submitOrder} and {@link submitOrders}.
   */
  private __buildOrderPayload(
    signer: PolymarketSigner,
    funder: `0x${string}`,
    version: ProtocolVersion,
    negRisk: boolean,
    input: BulkOrderInput,
    owner: string,
  ): Record<string, unknown> {
    const params: BuildOrderParams = {
      version,
      negRisk,
      funder,
      signerAddress: signer.address,
      tokenId: input.tokenId,
      side: input.side,
      price: input.price,
      shares: input.shares,
      nowMs: Date.now(),
      signatureType: this.__signatureType,
      expirationTime: input.expirationTime,
    };
    const built = buildOrder(params);
    const signature = signOrder(signer, built);
    const payload: Record<string, unknown> = {
      order: orderWireJson(built, signature),
      orderType: input.orderType,
      owner,
    };
    if (input.postOnly !== undefined) payload.postOnly = input.postOnly;
    if (input.deferExec !== undefined) payload.deferExec = input.deferExec;
    return payload;
  }

  /**
   * Submits one chunk (at most {@link BULK_ORDER_CHUNK_SIZE} orders) to
   * `POST /orders`. A `2xx` response can still carry a per-order
   * `order_version_mismatch` on just SOME entries (see
   * {@link __isMismatchEntry}) — only THOSE specific orders are rebuilt
   * (fresh protocol version) and resent, never the whole chunk. Resending
   * a sibling order that already matched on the first attempt would
   * submit a second, freshly-signed order for a position that's already
   * filled: every rebuild uses a `Date.now()`-derived salt/timestamp (see
   * `PolymarketOrder.ts`'s `makeSalt`), so a "resubmission" is
   * cryptographically a brand-new order the venue has no way to recognize
   * as one it already handled — a real double-fill risk the previous
   * whole-chunk retry carried.
   *
   * Never throws for a vendor-side outcome (whole-chunk rejection, a
   * persisted mismatch after retry) — both become per-row `rejected: true`
   * results instead, so this chunk's genuine outcomes (and any sibling
   * chunk's) are never discarded by one chunk's failure.
   */
  private async __submitOrderChunk(
    signer: PolymarketSigner,
    creds: ClobApiCredentials,
    funder: `0x${string}`,
    version: ProtocolVersion,
    chunk: readonly BulkOrderInput[],
    negRisks: readonly boolean[],
  ): Promise<OrderResult[]> {
    const post = async (
      protocolVersion: ProtocolVersion,
      postChunk: readonly BulkOrderInput[],
      postNegRisks: readonly boolean[],
    ): Promise<
      { response: RESTlerResponse<unknown>; parsed: ClobPostOrderResponse[] }
    > => {
      const payload = postChunk.map((order, i) =>
        this.__buildOrderPayload(
          signer,
          funder,
          protocolVersion,
          postNegRisks[i]!,
          order,
          creds.apiKey,
        )
      );
      return await this.__requestOrderResponse<ClobPostOrderResponse[]>(
        // `RESTlerContentTypePayload`'s type doesn't model a JSON ARRAY body
        // (only `Record<string, unknown>`/`string`/...) even though
        // `_buildBody`'s runtime just `JSON.stringify`s whatever `payload`
        // is — the cast resolves that type-only gap, mirroring
        // `__deleteWithBody`'s identical rationale below.
        {
          path: '/orders',
          baseURL: this.__clobBaseURL,
          method: 'POST',
          contentType: 'JSON',
          payload,
          auth: this.__l2Auth(signer, creds),
        } as unknown as RESTlerEndpoint,
        // A whole-chunk rejection (invalid payload, >15 orders, an
        // owner/signer mismatch) comes back as a single error OBJECT, not
        // an array — normalize it to a one-element array so parsing never
        // fails; the caller detects that shape via the length mismatch
        // against what it posted.
        (data) =>
          (Array.isArray(data) ? data : [data]).map((entry) =>
            ClobPostOrderResponseSchemaObject.parse(entry)
          ),
      );
    };

    const { response, parsed } = await post(version, chunk, negRisks);
    const status = response.status ?? 0;
    const httpOk = status >= 200 && status < 300;
    if (!httpOk && parsed.length !== chunk.length) {
      // The vendor returned one error for the whole request, not one per
      // order — every order in this chunk was refused, none partially.
      const detail = parsed[0]?.errorMsg ?? 'unknown reason';
      return chunk.map((order) =>
        this.__toBulkOrderResult(
          status,
          { errorMsg: detail, success: false },
          order.side,
          order.price,
        )
      );
    }

    const mismatchIndices: number[] = [];
    parsed.forEach((entry, i) => {
      if (Polymarket.__isMismatchEntry(entry)) mismatchIndices.push(i);
    });

    if (mismatchIndices.length > 0) {
      const freshVersion = await this.getVersion(true);
      const retryChunk = mismatchIndices.map((i) => chunk[i]!);
      const retryNegRisks = mismatchIndices.map((i) => negRisks[i]!);
      const retry = await post(freshVersion, retryChunk, retryNegRisks);
      const retryStatus = retry.response.status ?? 0;
      const retryHttpOk = retryStatus >= 200 && retryStatus < 300;
      const retryFailedWhole = !retryHttpOk &&
        retry.parsed.length !== retryChunk.length;
      mismatchIndices.forEach((origIndex, j) => {
        parsed[origIndex] = retryFailedWhole
          ? {
            errorMsg: retry.parsed[0]?.errorMsg ?? 'unknown reason',
            success: false,
          }
          : retry.parsed[j]!;
      });
      // Any entry still showing a mismatch after the retry is a genuine,
      // persisted problem — reported per-row (never thrown), matching this
      // method's "never discard another order's outcome" contract.
      for (const i of mismatchIndices) {
        if (Polymarket.__isMismatchEntry(parsed[i]!)) {
          parsed[i] = {
            errorMsg:
              'order_version_mismatch persisted after refreshing the protocol version and retrying once',
            success: false,
          };
        }
      }
    }

    if (parsed.length !== chunk.length) {
      // Anomalous vendor response shape (shouldn't happen once the checks
      // above have run) — fail loudly and typed rather than silently
      // returning fewer results than orders submitted, or crashing on an
      // out-of-range `chunk[i]` below.
      throw new PolymarketError('RESPONSE_ERROR', {
        responseError:
          `expected ${chunk.length} bulk order results, got ${parsed.length}`,
      });
    }
    return parsed.map((entry, i) =>
      this.__toBulkOrderResult(status, entry, chunk[i]!.side, chunk[i]!.price)
    );
  }

  /** Whether one bulk-response entry reports the vendor's `order_version_mismatch` marker. */
  private static __isMismatchEntry(entry: ClobPostOrderResponse): boolean {
    return (entry.errorMsg ?? '').toLowerCase().includes(
      VERSION_MISMATCH_MARKER,
    );
  }

  /**
   * Maps one bulk-response entry to an {@link OrderResult}. Unlike
   * {@link __toSubmitOrderResult} (single-order path, which reads the outer
   * HTTP status), a bulk entry's own `success`/`errorMsg` fields are the
   * per-order outcome signal — the outer HTTP status only tells us the
   * *request itself* was accepted, not any individual order within it.
   */
  private __toBulkOrderResult(
    outerHttpStatus: number,
    entry: ClobPostOrderResponse,
    side: OrderSide,
    requestedPrice: number,
  ): OrderResult {
    const errorText = (entry.errorMsg ?? '').toLowerCase();
    const noMatch = errorText.includes(FAK_NO_MATCH_MARKER) ||
      errorText.includes(FOK_NO_MATCH_MARKER);
    const failed = entry.success === false ||
      (entry.success === undefined && !!entry.errorMsg);

    if (failed) {
      return {
        action: side,
        success: false,
        filled: false,
        noMatch,
        rejected: !noMatch,
        detail: noMatch ? undefined : (entry.errorMsg ?? 'unknown reason'),
        id: entry.orderId ?? '',
        status: entry.status ?? (noMatch ? 'no-match' : 'rejected'),
        requestedPrice,
        slippage: 0,
        makingAmount: 0,
        takingAmount: 0,
        httpStatus: outerHttpStatus,
        raw: entry,
      };
    }

    const makingAmount = Polymarket.__toAmount(entry.makingAmount);
    const takingAmount = Polymarket.__toAmount(entry.takingAmount);
    const filled = makingAmount > 0 &&
      (entry.status ?? '').toLowerCase() === 'matched';
    const actualPrice = filled
      ? Polymarket.__effectivePrice(side, makingAmount, takingAmount)
      : undefined;
    return {
      action: side,
      success: filled,
      filled,
      noMatch: false,
      rejected: false,
      id: entry.orderId ?? '',
      status: entry.status ?? '',
      requestedPrice,
      actualPrice,
      slippage: actualPrice !== undefined
        ? Polymarket.__round6(requestedPrice - actualPrice)
        : 0,
      makingAmount,
      takingAmount,
      httpStatus: outerHttpStatus,
      raw: entry,
    };
  }

  /** `Number(v === '' ? 0 : (v ?? 0)) || 0` — the venue's amount fields are decimal strings, sometimes empty. */
  private static __toAmount(value: string | undefined): number {
    if (value === undefined || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Effective per-share execution price from filled making/taking amounts,
   * mirroring {@link buildOrder}'s BUY/SELL maker/taker convention (BUY:
   * maker gives USDC, takes shares; SELL: mirrored). `undefined` when
   * either amount is non-positive — nothing to divide.
   */
  private static __effectivePrice(
    side: OrderSide,
    makingAmount: number,
    takingAmount: number,
  ): number | undefined {
    if (makingAmount <= 0 || takingAmount <= 0) return undefined;
    const price = side === 'BUY'
      ? makingAmount / takingAmount
      : takingAmount / makingAmount;
    return Polymarket.__round6(price);
  }

  /** Rounds to 6dp (pUSD's on-chain precision) to avoid binary-float noise (e.g. `0.55 - 0.5 === 0.050000000000000044`) leaking into a human-facing price/slippage value. */
  private static __round6(value: number): number {
    return Math.round(value * 1e6) / 1e6;
  }

  /**
   * Injects Polymarket's L1/L2/Relayer headers. Deliberately does NOT fall
   * back to the instance-level `_getOption('auth')` the way the base
   * implementation does for `BASIC`/`BEARER` — every Gamma call leaves
   * `endpoint.auth` unset and must stay unauthenticated regardless of
   * whether this instance was constructed with CLOB `auth`, so the base
   * class's automatic "no per-call auth -> use the instance default"
   * fallback is exactly the wrong behavior here. Every CLOB/Relayer method
   * above opts in explicitly via `endpoint.auth` (see {@link __l2Auth},
   * {@link __relayerAuth}, and `deriveApiCredentials`'s inline L1 headers).
   */
  protected override async _authInjector(
    endpoint: RESTlerEndpoint,
  ): Promise<void> {
    // Preserves the base class's config validation (throws
    // RESTlerConfigError for a malformed `endpoint.auth`) — a no-op beyond
    // that for `type: 'CUSTOM'` (the base class only sets headers itself
    // for BASIC/BEARER), so this never interferes with the CLOB/Relayer
    // handling below.
    await super._authInjector(endpoint);

    const auth = endpoint.auth as
      | {
        type: 'CUSTOM';
        clobAuthKind?: 'L2' | 'RELAYER';
        signerAddress?: string;
        creds?: L2Credentials;
        relayerApiKey?: string;
        relayerApiKeyAddress?: string;
      }
      | undefined;
    if (!auth || auth.type !== 'CUSTOM') return;

    if (auth.clobAuthKind === 'RELAYER') {
      if (!auth.relayerApiKey || !auth.relayerApiKeyAddress) return;
      endpoint.headers = {
        ...endpoint.headers,
        RELAYER_API_KEY: auth.relayerApiKey,
        RELAYER_API_KEY_ADDRESS: auth.relayerApiKeyAddress,
      };
      return;
    }

    if (auth.clobAuthKind !== 'L2') return;
    if (!auth.signerAddress || !auth.creds) return;

    endpoint.headers = endpoint.headers ?? {};
    const method = (endpoint as { method: string }).method;
    const payload = 'payload' in endpoint
      ? (endpoint as { payload?: unknown }).payload
      : undefined;
    const body = payload !== undefined ? JSON.stringify(payload) : '';
    const timestampSec = Math.floor(Date.now() / 1000);
    const headers = await buildL2Headers(
      auth.signerAddress,
      auth.creds,
      timestampSec,
      method,
      endpoint.path,
      body,
    );
    Object.assign(endpoint.headers, headers);
  }

  /**
   * Marks Polymarket's CLOB and Relayer auth headers as sensitive so they
   * never surface in `call`/`authFailure` event payloads or thrown-error
   * request contexts, mirroring the base redacted set (`Authorization`, ...).
   */
  protected override _isSensitiveHeader(name: string): boolean {
    const lower = name.toLowerCase();
    return lower === 'poly_signature' || lower === 'poly_passphrase' ||
      lower === 'poly_api_key' || lower === 'relayer_api_key' ||
      super._isSensitiveHeader(name);
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link PolymarketError}.
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
        throw new PolymarketError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      if (err instanceof RESTlerRateLimitError) {
        // RESTler retried once (maxRetryWait) and was throttled again, or the
        // vendor's hint exceeded the cap — surface it as this connect's own
        // error, with the hint and whether a wait already happened.
        throw new PolymarketError('RATE_LIMITED', {
          status: 429,
          retryAfterSeconds: err.getContextValue('retryAfter'),
          retried: err.getContextValue('retried'),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Response classification shared by {@link submitOrder}/{@link submitOrders}'s
   * signed order-submission calls (`POST /order`, `POST /orders`). A
   * 400/422 (and any 2xx) is passed through UNCLASSIFIED — it can mean a
   * graceful FAK/FOK no-match or a retryable `order_version_mismatch`, not
   * necessarily a genuine error; {@link __toSubmitOrderResult}/
   * {@link __toBulkOrderResult} make that call from the parsed body.
   * Every OTHER status (401/404/429/5xx/...) gets the exact same
   * classification as every other endpoint in this connect, via the
   * shared {@link __toError} — order submission previously bypassed this
   * entirely via its own `responseHandler`, folding a rate limit or an
   * expired credential into a generic `ORDER_REJECTED` alongside genuine
   * order rejections, with no way for a caller to tell them apart.
   */
  private __orderResponseHandler(response: RESTlerResponse<unknown>): unknown {
    const status = response.status ?? 0;
    if (status === 400 || status === 422 || (status >= 200 && status < 300)) {
      return response.body;
    }
    return this.__toError(response);
  }

  /**
   * Like {@link __requestAndValidate}, but for the order-submission calls
   * that need the raw {@link RESTlerResponse} (its `status`) alongside the
   * parsed body, not just the validated value `__requestAndValidate`
   * returns. Routes every response through {@link __orderResponseHandler}
   * and wraps a `RESTlerResponseValidationError` into
   * `PolymarketError('RESPONSE_ERROR', ...)` the same way
   * `__requestAndValidate` does, so a malformed 2xx body never leaks the
   * base library's error type past this connect's own documented
   * `@throws {PolymarketError}`.
   */
  private async __requestOrderResponse<B>(
    endpoint: RESTlerEndpoint,
    responseSchema: (data: unknown) => B,
  ): Promise<{ response: RESTlerResponse<unknown>; parsed: B }> {
    try {
      const response = await this._makeRequest(endpoint, {
        responseHandler: (r) => this.__orderResponseHandler(r),
        responseSchema,
      });
      return { response, parsed: response.body as B };
    } catch (err) {
      if (err instanceof RESTlerResponseValidationError) {
        throw new PolymarketError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      if (err instanceof RESTlerRateLimitError) {
        // RESTler retried once (maxRetryWait) and was throttled again, or the
        // vendor's hint exceeded the cap — surface it as this connect's own
        // error, with the hint and whether a wait already happened.
        throw new PolymarketError('RATE_LIMITED', {
          status: 429,
          retryAfterSeconds: err.getContextValue('retryAfter'),
          retried: err.getContextValue('retried'),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler, shared by Gamma, the CLOB, and the
   * Relayer. All three return a plain `{"error": "..."}` (or occasionally
   * a bare string) body on failure; none documents vendor-specific numeric
   * error codes the way some connects' vendors do, so this dispatches on
   * HTTP status alone. {@link submitOrder}/{@link submitOrders} bypass
   * this entirely (via a per-call `responseHandler`) because a 4xx there
   * can mean "graceful no-match" or "retry with the other protocol
   * version", not a genuine error.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    const context = { status, body: response.body };
    if (status === 401) {
      throw new PolymarketError('AUTH_FAILED', {
        ...context,
        detail: Polymarket.__errorDetail(response.body),
      });
    }
    if (status === 404) throw new PolymarketError('NOT_FOUND', context);
    if (status === 429) {
      throw new PolymarketError('RATE_LIMITED', {
        ...context,
        retryAfterSeconds: this._parseRetryAfter(response.headers),
      });
    }
    if (status === 400 || status === 422) {
      throw new PolymarketError('INVALID_REQUEST', {
        ...context,
        detail: Polymarket.__errorDetail(response.body),
      });
    }
    if (status >= 500) {
      throw new PolymarketError('SERVICE_UNAVAILABLE', context);
    }
    throw new PolymarketError('UNKNOWN_ERROR', context);
  }

  /** Extracts a human-readable detail string from an error body shaped `{error: "..."}` or a bare string, without assuming either. */
  private static __errorDetail(body: unknown): string {
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object' && 'error' in body) {
      const value = (body as { error: unknown }).error;
      if (typeof value === 'string') return value;
    }
    return 'unknown reason';
  }
}
