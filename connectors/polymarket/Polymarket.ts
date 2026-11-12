import {
  type ResponseBody,
  RESTler,
  type RESTlerAuth,
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
import { type BaseGuardian, Guardian, type GuardianError } from '@guardian';
import { checksumAddress, toHex } from './PolymarketEip712.ts';
import {
  buildL1Headers,
  buildL2Headers,
  type L2Credentials,
} from './PolymarketAuth.ts';
import {
  builtInSigner,
  type DigestSigner,
  externalSigner,
  type PolymarketExternalSigner,
  PolymarketSigner,
} from './PolymarketSigner.ts';
import {
  buildOrder,
  orderDigest,
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
  buildV2MergeTx,
  buildV2RedeemTxs,
  buildV2SplitTx,
  v2PositionId,
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
  type ClobOpenOrder,
  ClobOpenOrderSchemaObject,
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
  type DataActivityPage,
  DataActivityPageSchemaObject,
  type DataPositionsPage,
  DataPositionsPageSchemaObject,
  type DataResolution,
  DataResolutionListSchemaObject,
  type DataToken,
  DataTokenListSchemaObject,
  type DataTradesPage,
  DataTradesPageSchemaObject,
  DataValueSchemaObject,
  type GammaMarket,
  GammaMarketKeysetPageSchemaObject,
  GammaMarketListSchemaObject,
  GammaMarketSchemaObject,
  type RelayerSubmitResponse,
  RelayerSubmitResponseSchemaObject,
  type RelayerTransaction,
  RelayerTransactionSchemaObject,
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
/** Production Data API host — public, read-only portfolio, activity, token and resolution views. Every route this client calls is under `/v2` (v1 retired 2026-11-02). */
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
 *
 * The wallet is EITHER `privateKey` OR `signer` — a
 * {@link PolymarketExternalSigner} that signs the 32-byte digests this
 * client builds, so the key never enters JavaScript. Likewise the L2 HMAC
 * can come from `apiCredentials.secret` or from `hmac`.
 */
export type PolymarketAuth =
  & PolymarketAuthCommon
  & (
    | {
      /**
       * Wallet EOA private key — 32 bytes of hex, with or without a `0x`
       * prefix. Required (or `signer`) for every CLOB trading method.
       */
      privateKey: string;
      signer?: never;
    }
    | {
      /**
       * Signs for the wallet outside JavaScript: receives each final EIP-712
       * / EIP-191 digest and returns the secp256k1 signature (`{ r, s, v }`
       * or 65 bytes). Every signature is checked to recover to
       * `signer.address` before it is used.
       */
      signer: PolymarketExternalSigner;
      privateKey?: never;
    }
  );

/** The {@link PolymarketAuth} fields shared by both wallet modes. */
export type PolymarketAuthCommon = {
  type: 'CUSTOM';
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
  /**
   * Already-derived L2 API credentials, if you have them — skips the
   * one-time {@link Polymarket.deriveApiCredentials} call. `secret` may be
   * omitted when `hmac` is given.
   */
  apiCredentials?: Omit<ClobApiCredentials, 'secret'> & { secret?: string };
  /**
   * Computes the L2 request signature without the API secret entering
   * JavaScript: given the message, returns URL-safe base64 (with padding)
   * of `HMAC-SHA256(base64url-decode(secret), message)` — exactly what
   * `hmacSign` in `PolymarketAuth.ts` returns. Used instead of
   * `apiCredentials.secret` for every REST request. (The WebSocket user
   * channel and PolyBolt send the raw secret, so they still need it.)
   */
  hmac?: (message: string) => Promise<string>;
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

/** A single id or a list of ids, sent comma-separated. */
export type IdList = string | readonly string[];

/** Filters for {@link Polymarket.getPositions} (`GET /v2/positions`). */
export type GetPositionsOptions = {
  /**
   * Wallet to read. Defaults to `auth.funder` (the proxy wallet that holds
   * positions). `null` drops the wallet anchor, listing a market's holders
   * instead — then `condition` must name exactly one market.
   */
  user?: string | null;
  /** Condition id(s), at most 20. With a wallet, narrows its positions. */
  condition?: IdList;
  /** Gamma event id(s), at most 20. Wallet-anchored reads only. */
  eventId?: IdList;
  /**
   * Lifecycle filter. `OPEN` (the vendor default) is the superset, settled-
   * but-unredeemed winners included; `REDEEMABLE` narrows to those;
   * `REDEEMABLE_LOST` to still-held losing sides; `MERGEABLE` to pairs that
   * can merge back to collateral; `CLOSED` to exited positions.
   */
  status?: 'OPEN' | 'REDEEMABLE' | 'REDEEMABLE_LOST' | 'MERGEABLE' | 'CLOSED';
  /** Case-insensitive market-title substring. Not carried by the cursor — resend it on every page. */
  title?: string;
  /** What `filterAmount` measures. Vendor default `TOKENS`. */
  filterType?: 'CASH' | 'TOKENS';
  /** Minimum current holding (shares for `TOKENS`, USDC for `CASH`). Vendor default 0.1 shares. */
  filterAmount?: number;
  /** Also include positions in archived markets. Not with `status: 'CLOSED'`. */
  includeArchived?: boolean;
  sortBy?:
    | 'CURRENT_VALUE'
    | 'PRICE'
    | 'TOKENS'
    | 'UNREALIZED_PNL'
    | 'REALIZED_PNL'
    | 'TOTAL_PNL'
    | 'TIMESTAMP';
  sortDirection?: 'ASC' | 'DESC';
  /** Epoch seconds, inclusive bounds on each row's `lastEventAt`. Resend on every page. */
  start?: number;
  end?: number;
  /** First-page size, at most 1000. Ignored with `cursor` (the cursor carries its own). */
  limit?: number;
  /** `pagination.nextCursor` from the previous page. Send it with the same `user`/`condition` anchor. */
  cursor?: string;
};

/** Filters for {@link Polymarket.getActivity} (`GET /v2/activity`). */
export type GetActivityOptions = {
  /** Wallet to read. Defaults to `auth.funder`. */
  user?: string;
  /**
   * Activity type(s): `TRADE`, `SPLIT`, `MERGE`, `REDEEM`, `CONVERSION`,
   * `MIGRATION`, `REWARD`, `YIELD`, `MAKER_REBATE`, `TAKER_REBATE`,
   * `REFERRAL_REWARD`, `DEPOSIT`, `WITHDRAWAL`, `TIP`, … Omitted, every type
   * but `TIP`.
   */
  type?: IdList;
  /** Condition id(s), at most 20. Mutually exclusive with `eventId`. */
  condition?: IdList;
  /** Gamma event id(s), at most 20. */
  eventId?: IdList;
  side?: 'BUY' | 'SELL';
  /** Epoch seconds, inclusive. Vendor default: three years back (`1` for full history). */
  start?: number;
  /** Epoch seconds, inclusive. Vendor default: now plus one day. */
  end?: number;
  /** Vendor default `DESC` (newest first). Bound into the cursor. */
  sortDirection?: 'ASC' | 'DESC';
  /** Include `DEPOSIT`/`WITHDRAWAL` rows (the vendor drops them by default). */
  includeDepositsWithdrawals?: boolean;
  /** Page size, vendor default 100, at most 1000. */
  limit?: number;
  cursor?: string;
};

/** Filters for {@link Polymarket.getTrades} (`GET /v2/trades`). */
export type GetTradesOptions = {
  /** Restrict to one wallet. Omitted, this is the market/event/global feed — there is no `auth.funder` default here. */
  user?: string;
  /** Condition id(s), at most 20. */
  condition?: IdList;
  /** Gamma event id(s), at most 20. */
  eventId?: IdList;
  side?: 'BUY' | 'SELL';
  /** Vendor default `true`: each fill once, on its taker side. `false` adds the maker rows. */
  takerOnly?: boolean;
  filterType?: 'CASH' | 'TOKENS';
  /** Minimum trade size; vendor default 0.01. */
  filterAmount?: number;
  /** Epoch seconds, inclusive. Honoured on the `user` shape only. */
  start?: number;
  end?: number;
  limit?: number;
  cursor?: string;
};

/** Selector for {@link Polymarket.getTokens} — exactly one of the two. */
export type GetTokensOptions =
  | {
    /** Up to 50 decimal token ids. Unknown ids are simply absent from the result. */
    tokenIds: readonly string[];
    conditions?: never;
  }
  | {
    /** Up to 10 condition selectors: a condition id, a neg-risk market id, or a polymarket-v2 condition/event id. */
    conditions: readonly string[];
    tokenIds?: never;
  };

/** Selector for {@link Polymarket.getResolutions} — exactly one of the three. */
export type GetResolutionsOptions =
  | { questionId: string; condition?: never; eventId?: never }
  | { condition: IdList; questionId?: never; eventId?: never }
  | { eventId: IdList; questionId?: never; condition?: never };

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
  /** Position system: `'v2'` lists only Polymarket Protocol V2 markets — Gamma leaves them out of an unfiltered listing. */
  version?: 'v1' | 'v2';
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

/** What to put in an order for one outcome of a market — see {@link orderAsset}. */
export type OrderAsset = {
  /** The outcome's id: `clobTokenIds[i]` (Gamma `version: "v1"`) or `positionIds[i]` (`"v2"`). */
  tokenId: string;
  /** `3` (ExchangeV3) for a Protocol V2 market; absent for a v1 market, so the CLOB's `/version` decides. */
  version?: ProtocolVersion;
};

/**
 * The order id and exchange version for one outcome of `market`, chosen by
 * the market's Gamma `version` as Polymarket's V2 migration guide requires:
 * `"v1"` → `clobTokenIds[i]`, signed for whatever `/version` reports;
 * `"v2"` → `positionIds[i]`, signed for ExchangeV3 (`version: 3`). Spread
 * it into {@link Polymarket.submitOrder} or {@link Polymarket.prepareOrder}.
 * Pure — no request.
 *
 * @param outcome - Outcome index, or its label (`'Yes'`, `'Up'`, …) as in `market.outcomes`.
 * @throws {PolymarketError} `INVALID_OPTIONS` for a missing or unknown
 * `version`, an unknown outcome, or a market without that outcome's id.
 *
 * @example
 * ```typescript
 * const market = (await client.getMarketBySlug(slug))!;
 * await client.submitOrder({
 *   ...orderAsset(market, 'Up'),
 *   side: 'BUY', price: 0.5, shares: 10, orderType: 'GTC',
 * });
 * ```
 */
export function orderAsset(
  market: Pick<
    GammaMarket,
    'version' | 'outcomes' | 'clobTokenIds' | 'positionIds'
  >,
  outcome: number | string,
): OrderAsset {
  const fail = (detail: string): never => {
    throw new PolymarketError('INVALID_OPTIONS', {
      method: 'orderAsset',
      detail,
    });
  };
  const index = typeof outcome === 'number'
    ? outcome
    : market.outcomes.indexOf(outcome);
  if (!Number.isInteger(index) || index < 0) {
    fail(`unknown outcome ${JSON.stringify(outcome)}`);
  }
  if (market.version === 'v1') {
    const tokenId = market.clobTokenIds[index];
    return tokenId ? { tokenId } : fail(`no clobTokenIds[${index}]`);
  }
  if (market.version === 'v2') {
    const tokenId = market.positionIds?.[index];
    return tokenId ? { tokenId, version: 3 } : fail(`no positionIds[${index}]`);
  }
  return fail(`unsupported market version ${JSON.stringify(market.version)}`);
}

/**
 * Which position system a market's split/merge/redeem goes through — see
 * {@link positionMarket}. `version` `'v1'` (the default) routes through the
 * CTF collateral adapter `negRisk` picks; `'v2'` through the Protocol V2
 * Router, for standard and neg-risk markets alike.
 */
export type PositionMarket =
  | { conditionId: string; version?: 'v1'; negRisk: boolean }
  | { conditionId: string; version: 'v2' };

/** Inputs to {@link Polymarket.split} and {@link Polymarket.merge}. */
export type SplitMergeOptions = PositionMarket & {
  /** pUSD to split into (or shares of each outcome to merge back from). */
  amountUsd: number;
};

/** Inputs to {@link Polymarket.redeem}. */
export type RedeemOptions =
  | { conditionId: string; version?: 'v1'; negRisk: boolean }
  | {
    conditionId: string;
    version: 'v2';
    /**
     * Shares to redeem per outcome, by outcome index (`[yes, no]`). The
     * Router takes an explicit amount; omitted, the wallet's whole
     * `CONDITIONAL-V2` balance of each outcome is read first (two
     * {@link Polymarket.getBalance} calls, which need CLOB credentials).
     */
    shares?: readonly number[];
  };

/**
 * The split/merge/redeem routing for `market`, from its Gamma `version`:
 * `"v1"` → `{ conditionId, negRisk }` (CTF collateral adapters); `"v2"` →
 * `{ conditionId, version: 'v2' }` (the Protocol V2 Router). Spread it
 * into {@link Polymarket.split}/{@link Polymarket.merge}/
 * {@link Polymarket.redeem}. Pure — no request.
 *
 * @throws {PolymarketError} `INVALID_OPTIONS` for a missing or unknown `version`.
 *
 * @example
 * ```typescript
 * const market = (await client.getMarketBySlug(slug))!;
 * await client.split({ ...positionMarket(market), amountUsd: 1 });
 * ```
 */
export function positionMarket(
  market: Pick<GammaMarket, 'version' | 'conditionId' | 'negRisk'>,
): PositionMarket {
  if (market.version === 'v1') {
    return { conditionId: market.conditionId, negRisk: market.negRisk };
  }
  if (market.version === 'v2') {
    return { conditionId: market.conditionId, version: 'v2' };
  }
  throw new PolymarketError('INVALID_OPTIONS', {
    method: 'positionMarket',
    detail: `unsupported market version ${JSON.stringify(market.version)}`,
  });
}

/** Inputs to {@link Polymarket.submitOrder}. */
export type SubmitOrderOptions = {
  /**
   * Outcome id (decimal string): a Gamma market's `clobTokenIds` entry, or
   * a Protocol V2 market's `positionIds` entry with `version: 3` —
   * {@link orderAsset} picks the right pair.
   */
  tokenId: string;
  side: OrderSide;
  /** On-tick, `[0.01, 0.99]`. */
  price: number;
  /** Cent-aligned — see {@link quantizeBuy}. */
  shares: number;
  orderType: 'GTC' | 'GTD' | 'FOK' | 'FAK';
  /** Unix SECONDS the order auto-cancels at. REQUIRED for `orderType: 'GTD'` (a GTD order with no expiration would silently behave exactly like GTC); ignored for GTC/FOK/FAK. */
  expirationTime?: number;
  /** Looked up via {@link Polymarket.getNegRisk} when omitted. Ignored for `version: 3` — ExchangeV3 has no neg-risk variant. */
  negRisk?: boolean;
  /** Looked up via {@link Polymarket.getVersion} when omitted. `3` (ExchangeV3) for a Protocol V2 market — never looked up, see {@link orderAsset}. */
  version?: ProtocolVersion;
  /** Order must rest on the book and not match immediately. Only valid for GTC/GTD. @default false */
  postOnly?: boolean;
  /** @default false */
  deferExec?: boolean;
};

/**
 * Inputs to {@link Polymarket.submitOrders} — one order. The CTF exchange
 * version is resolved once for the whole batch; only a Protocol V2 order
 * carries its own `version: 3` (from {@link orderAsset}).
 */
export type BulkOrderInput = Omit<SubmitOrderOptions, 'version'> & {
  version?: 3;
};

/** Inputs to {@link Polymarket.prepareOrder} — an order plus the two values that fix its identity. */
export type PrepareOrderOptions = SubmitOrderOptions & {
  /** Fixed salt — an integer below 2^53. Random when omitted. */
  salt?: number;
  /** Build clock, Unix ms: the V2 order's signed `timestamp`. @default Date.now() */
  nowMs?: number;
};

/**
 * A built and signed order that has not been sent. Its `orderHash` is the
 * order's identity on Polymarket (the EIP-712 hash the CLOB reports as the
 * order id), known before submission. Send it with
 * {@link Polymarket.submitPrepared} — never rebuilt, so the hash holds.
 */
export type PreparedOrder = {
  /** EIP-712 hash of the signed order — Polymarket's order id. */
  orderHash: `0x${string}`;
  salt: number;
  /** The protocol version it was signed for. */
  version: ProtocolVersion;
  negRisk: boolean;
  tokenId: string;
  side: OrderSide;
  price: number;
  shares: number;
  orderType: SubmitOrderOptions['orderType'];
  /** The signed `timestamp` (ms) — V2's struct field; also used for V1's salt entropy. */
  timestampMs: number;
  signature: `0x${string}`;
  /** The signed order exactly as it goes on the wire (`order` in the request body). */
  order: Record<string, unknown>;
  postOnly?: boolean;
  deferExec?: boolean;
};

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
  | ({ action: 'SPLIT' | 'MERGE' } & SplitMergeOptions)
  | ({ action: 'REDEEM' } & RedeemOptions);

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
  /**
   * Why a batch row was rejected, when it is one this client can name:
   * `VERSION_STALE` (signed for a protocol version the venue no longer
   * serves — prepare a new order) or `DUPLICATE` (this exact order was
   * already placed). Only set by {@link Polymarket.submitPreparedBatch}
   * and {@link Polymarket.submitOrders}.
   */
  rejectionCode?: 'VERSION_STALE' | 'DUPLICATE';
  /** The CLOB order id, or the Relayer transaction id. */
  id: string;
  /** BUY/SELL only — the signed order's EIP-712 hash, its identity before and after sending. */
  orderHash?: `0x${string}`;
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
 * need `auth.relayerApiKey`/`auth.relayerApiKeyAddress`. The Data API v2
 * reads (positions, value, activity, trades, tokens, resolutions) are
 * public. WebSocket feeds live in the separate `./sockets` export.
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
  private __signer?: DigestSigner;
  private __funder?: `0x${string}`;
  private __apiCreds?: Omit<ClobApiCredentials, 'secret'> & { secret?: string };
  private __hmac?: (message: string) => Promise<string>;
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
      if (auth.signer) {
        try {
          this.__signer = Polymarket.__guardSigner(externalSigner(auth.signer));
        } catch (cause) {
          throw new PolymarketError(
            'CONFIG_INVALID_SIGNER',
            { detail: cause instanceof Error ? cause.message : String(cause) },
            cause instanceof Error ? cause : undefined,
          );
        }
      } else {
        try {
          this.__signer = builtInSigner(new PolymarketSigner(auth.privateKey));
        } catch (cause) {
          throw new PolymarketError(
            'CONFIG_INVALID_PRIVATE_KEY',
            {},
            cause instanceof Error ? cause : undefined,
          );
        }
      }
      this.__hmac = auth.hmac;
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
    return this.__apiCreds !== undefined &&
      (this.__apiCreds.secret !== undefined || this.__hmac !== undefined);
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
    if (options.version) query.version = options.version;
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
    if (this.hasApiCredentials) {
      // With `auth.hmac` the secret was never given to this client.
      return { secret: '', ...this.__apiCreds! };
    }
    const signer = this.__requireSigner();
    const timestampSec = Math.floor(Date.now() / 1000);
    const headers = await buildL1Headers(
      signer,
      this.__chainId,
      timestampSec,
      nonce,
    );

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
   * @param options.version - `3` for a Protocol V2 position (`asset_type=CONDITIONAL-V2`), as {@link orderAsset} returns it. The collateral balance's `allowances` lists ExchangeV3 once it is approved.
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`.
   *
   * @example
   * ```typescript
   * const { balance } = await client.getBalance(); // USDC, e.g. 125.5
   * const shares = await client.getBalance({ tokenId }); // shares of one outcome
   * const v2 = await client.getBalance(orderAsset(market, 'Yes')); // a V2 position
   * ```
   */
  public async getBalance(
    options: { tokenId?: string; version?: ProtocolVersion } = {},
  ): Promise<ClobBalance> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    return await this.__requestAndValidate(
      {
        path: '/balance-allowance',
        baseURL: this.__clobBaseURL,
        method: 'GET',
        query: this.__balanceQuery(options),
        auth: this.__l2Auth(signer, creds),
      },
      ClobBalanceSchemaObject,
    );
  }

  /**
   * Has the CLOB re-read this wallet's on-chain balance and allowances
   * (`GET /balance-allowance/update`), then returns the fresh
   * {@link getBalance} reading. The venue checks orders against its own
   * cached copy, which can lag the chain: call this after anything that
   * changed the wallet outside the CLOB — a confirmed
   * {@link split}/{@link merge}/{@link redeem}, a deposit, or a new
   * approval — before placing an order that relies on it. Same options as
   * {@link getBalance}; one asset per call.
   *
   * @param options.tokenId - Outcome token id for a share balance; omit for pUSD.
   * @param options.version - `3` for a Protocol V2 position, as {@link orderAsset} returns it.
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`;
   * otherwise as {@link getBalance}.
   *
   * @example
   * ```typescript
   * const { id } = await client.split({ ...positionMarket(market), amountUsd: 5 });
   * // ...poll getRelayerTransaction(id) until STATE_CONFIRMED, then:
   * const shares = await client.refreshBalance(orderAsset(market, 'Yes'));
   * ```
   */
  public async refreshBalance(
    options: { tokenId?: string; version?: ProtocolVersion } = {},
  ): Promise<ClobBalance> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    // The body carries nothing to validate — a non-2xx still throws through
    // the connect-wide error mapping.
    await this._makeRequest({
      path: '/balance-allowance/update',
      baseURL: this.__clobBaseURL,
      method: 'GET',
      query: this.__balanceQuery(options),
      auth: this.__l2Auth(signer, creds),
    });
    return await this.getBalance(options);
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
   * One of the account's orders by id — its `orderHash` — whatever its
   * status: resting, fully matched or cancelled. The reconciliation lookup
   * for an order recorded before it was sent (see {@link prepareOrder}).
   *
   * @throws {PolymarketError} `NOT_FOUND` when the venue has no such order
   * for this account (it answers `200` with a `null` body) — including,
   * briefly, an order it has only just accepted;
   * `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`; `RESPONSE_ERROR`
   * when the body fails validation.
   *
   * @example
   * ```typescript
   * const order = await client.getOrder(prepared.orderHash);
   * console.log(order.status, order.sizeMatched, order.originalSize);
   * ```
   */
  public async getOrder(orderId: string): Promise<ClobOpenOrder> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    const order = await this.__requestAndValidate(
      {
        path: `/data/order/${encodeURIComponent(orderId)}`,
        baseURL: this.__clobBaseURL,
        method: 'GET',
        auth: this.__l2Auth(signer, creds),
      },
      ClobOpenOrderSchemaObject.nullable(),
    );
    if (order === null) {
      throw new PolymarketError('NOT_FOUND', { status: 200, body: null });
    }
    return order;
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

  // ── Data API v2 (public portfolio, activity, tokens, resolutions) ───────

  /**
   * One cursor page of a wallet's positions with fee-exclusive basis,
   * mark-to-market value and PnL, from the public Data API — no signing
   * involved. Defaults to `auth.funder` (the proxy wallet that holds the
   * positions); pass `user` to read any other wallet, or `user: null` with
   * one `condition` to list that market's holders. Follow
   * `pagination.nextCursor` until it is `null`.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` when `user` is
   * omitted and `auth.funder` is not set; `INVALID_OPTIONS` for
   * `user: null` without a `condition`; `RESPONSE_ERROR` when the body
   * fails validation; or `INVALID_REQUEST`/`RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * let cursor: string | undefined;
   * do {
   *   const page = await client.getPositions({ status: 'REDEEMABLE', cursor });
   *   for (const p of page.data) console.log(p.title, p.outcome, p.currentSize, p.unrealizedPnl);
   *   cursor = page.pagination.nextCursor ?? undefined;
   * } while (cursor);
   * ```
   */
  public async getPositions(
    options: GetPositionsOptions = {},
  ): Promise<DataPositionsPage> {
    const query: Record<string, string> = {};
    if (options.user === null) {
      if (options.condition === undefined) {
        throw new PolymarketError('INVALID_OPTIONS', {
          method: 'getPositions',
          detail: '`user: null` (market holders) needs a `condition`',
        });
      }
    } else {
      query.user = options.user ?? this.__requireFunder();
    }
    Polymarket.__setList(query, 'condition', options.condition);
    Polymarket.__setList(query, 'event_id', options.eventId);
    Polymarket.__setQuery(query, {
      status: options.status,
      title: options.title,
      filter_type: options.filterType,
      filter_amount: options.filterAmount,
      include_archived: options.includeArchived,
      sort_by: options.sortBy,
      sort_direction: options.sortDirection,
      start: options.start,
      end: options.end,
      limit: options.limit,
      cursor: options.cursor,
    });
    return await this.__requestAndValidate(
      {
        path: '/v2/positions',
        baseURL: this.__dataBaseURL,
        method: 'GET',
        query,
      },
      DataPositionsPageSchemaObject,
    );
  }

  /**
   * Total value of a wallet's positions in USDC — single-market holdings
   * marked to market plus unresolved combos at cost basis — from the public
   * Data API. Defaults to `auth.funder`; `condition` narrows it to one or
   * more markets (and drops the combo term). `0` for a wallet with no
   * positions.
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
    options: { user?: string; condition?: IdList } = {},
  ): Promise<number> {
    const query: Record<string, string> = {
      user: options.user ?? this.__requireFunder(),
    };
    Polymarket.__setList(query, 'condition', options.condition);
    const row = await this.__requestAndValidate(
      {
        path: '/v2/value',
        baseURL: this.__dataBaseURL,
        method: 'GET',
        query,
      },
      DataValueSchemaObject,
    );
    return row.value;
  }

  /**
   * One cursor page of a wallet's on-chain activity — trades, splits,
   * merges, redeems (one row per outcome), rewards, rebates, … — newest
   * first by default. Defaults to `auth.funder`.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` when neither
   * `user` nor `auth.funder` is available; `RESPONSE_ERROR` when the body
   * fails validation; or `INVALID_REQUEST`/`RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const { data } = await client.getActivity({ type: ['TRADE', 'REDEEM'], limit: 50 });
   * for (const row of data) console.log(row.type, row.size, row.usdcSize, row.transactionHash);
   * ```
   */
  public async getActivity(
    options: GetActivityOptions = {},
  ): Promise<DataActivityPage> {
    const query: Record<string, string> = {
      user: options.user ?? this.__requireFunder(),
    };
    Polymarket.__setList(query, 'type', options.type);
    Polymarket.__setList(query, 'condition', options.condition);
    Polymarket.__setList(query, 'event_id', options.eventId);
    Polymarket.__setQuery(query, {
      side: options.side,
      start: options.start,
      end: options.end,
      sort_direction: options.sortDirection,
      exclude_deposits_withdrawals: options.includeDepositsWithdrawals ===
          undefined
        ? undefined
        : !options.includeDepositsWithdrawals,
      limit: options.limit,
      cursor: options.cursor,
    });
    return await this.__requestAndValidate(
      {
        path: '/v2/activity',
        baseURL: this.__dataBaseURL,
        method: 'GET',
        query,
      },
      DataActivityPageSchemaObject,
    );
  }

  /**
   * One cursor page of the public trade feed — every fill once, on its
   * taker side, unless `takerOnly: false`. Filter by wallet, market or
   * event; with none, the global feed. (For the account's own CLOB fills,
   * with maker detail, use {@link getFills}.)
   *
   * @throws {PolymarketError} `RESPONSE_ERROR` when the body fails
   * validation; or `INVALID_REQUEST`/`RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const { data: trades } = await client.getTrades({ condition: conditionId, limit: 100 });
   * for (const t of trades) console.log(t.side, t.size, t.price, t.timestamp);
   * ```
   */
  public async getTrades(
    options: GetTradesOptions = {},
  ): Promise<DataTradesPage> {
    const query: Record<string, string> = {};
    Polymarket.__setList(query, 'condition', options.condition);
    Polymarket.__setList(query, 'event_id', options.eventId);
    Polymarket.__setQuery(query, {
      user: options.user,
      side: options.side,
      taker_only: options.takerOnly,
      filter_type: options.filterType,
      filter_amount: options.filterAmount,
      start: options.start,
      end: options.end,
      limit: options.limit,
      cursor: options.cursor,
    });
    return await this.__requestAndValidate(
      {
        path: '/v2/trades',
        baseURL: this.__dataBaseURL,
        method: 'GET',
        query,
      },
      DataTradesPageSchemaObject,
    );
  }

  /**
   * Reference facts for outcome tokens — condition, contract module,
   * outcome slot and label, the opposite token, and on-chain settlement
   * (`resolved`, `finalPrice`) — by up to 50 token ids (request order kept,
   * unknown ids absent) or for every token of up to 10 conditions.
   *
   * @throws {PolymarketError} `INVALID_OPTIONS` unless exactly one selector
   * is given; `RESPONSE_ERROR` when the body fails validation; or
   * `INVALID_REQUEST`/`RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const tokens = await client.getTokens({ conditions: [conditionId] });
   * for (const t of tokens) console.log(t.outcome, t.tokenId, t.resolved, t.finalPrice);
   * ```
   */
  public async getTokens(options: GetTokensOptions): Promise<DataToken[]> {
    const query: Record<string, string> = {};
    if (options.tokenIds !== undefined) {
      Polymarket.__setList(query, 'token_id', options.tokenIds);
    }
    if (options.conditions !== undefined) {
      Polymarket.__setList(query, 'condition', options.conditions);
    }
    if (Object.keys(query).length !== 1) {
      throw new PolymarketError('INVALID_OPTIONS', {
        method: 'getTokens',
        detail: 'pass exactly one non-empty `tokenIds` or `conditions`',
      });
    }
    return await this.__requestAndValidate(
      {
        path: '/v2/tokens',
        baseURL: this.__dataBaseURL,
        method: 'GET',
        query,
      },
      DataTokenListSchemaObject,
    );
  }

  /**
   * Resolution lifecycle by UMA question, condition(s) or Gamma event(s):
   * status, dispute flags, payouts once settled, and — while a proposal or
   * vote is live — `expectedSettlementTime` with its `settlementTimeBasis`.
   * The estimate is not a deadline: a disputed vote can roll into a later
   * round, and none is given while `extendedReview` is `true`. Answers are
   * cached by the vendor for up to 5 seconds while any row is live.
   *
   * @throws {PolymarketError} `INVALID_OPTIONS` unless exactly one selector
   * is given; `RESPONSE_ERROR` when the body fails validation; or
   * `INVALID_REQUEST`/`RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const [row] = await client.getResolutions({ condition: conditionId });
   * if (row?.status !== 'resolved') console.log('settles ~', row?.expectedSettlementTime);
   * ```
   */
  public async getResolutions(
    options: GetResolutionsOptions,
  ): Promise<DataResolution[]> {
    const query: Record<string, string> = {};
    Polymarket.__setQuery(query, { question_id: options.questionId });
    Polymarket.__setList(query, 'condition', options.condition);
    Polymarket.__setList(query, 'event_id', options.eventId);
    if (Object.keys(query).length !== 1) {
      throw new PolymarketError('INVALID_OPTIONS', {
        method: 'getResolutions',
        detail: 'pass exactly one of `questionId`, `condition` or `eventId`',
      });
    }
    return await this.__requestAndValidate(
      {
        path: '/v2/resolutions',
        baseURL: this.__dataBaseURL,
        method: 'GET',
        query,
      },
      DataResolutionListSchemaObject,
    );
  }

  /**
   * Build and sign one order WITHOUT sending it. The result carries the
   * order's identity — `orderHash`, the EIP-712 hash Polymarket uses as the
   * order id — so it can be recorded before {@link submitPrepared} sends
   * it. Deterministic: the same options, `salt` and `nowMs` always give the
   * same `orderHash` and signature.
   *
   * @param options.salt - Fixed salt (an integer below 2^53). Random when omitted.
   * @param options.nowMs - Build clock (ms) — the V2 order's signed
   * `timestamp` and the random salt's entropy. @default Date.now()
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` without a signer
   * or `auth.funder`, `ORDER_REJECTED` for a locally invalid order (a GTD
   * order without `expirationTime`, an invalid `salt`/`nowMs`).
   *
   * @example
   * ```typescript
   * const prepared = await client.prepareOrder({
   *   tokenId, side: 'BUY', price: 0.55, shares: 9, orderType: 'GTC',
   * });
   * await journal.record(prepared.orderHash); // identity known before sending
   * const result = await client.submitPrepared(prepared);
   * ```
   */
  public async prepareOrder(
    options: PrepareOrderOptions,
  ): Promise<PreparedOrder> {
    const signer = this.__requireSigner();
    const funder = this.__requireFunder();
    Polymarket.__validateOrderInput(options);
    if (options.version === 3) {
      return await this.__prepare(signer, funder, 3, false, options);
    }
    const [version, negRisk] = await Promise.all([
      options.version !== undefined
        ? Promise.resolve(options.version)
        : this.getVersion(),
      options.negRisk !== undefined
        ? Promise.resolve(options.negRisk)
        : this.getNegRisk(options.tokenId),
    ]);
    return await this.__prepare(signer, funder, version, negRisk, options);
  }

  /**
   * {@link prepareOrder} for many orders at once — one version lookup and
   * one neg-risk lookup per distinct token. Results are in input order.
   *
   * @throws {PolymarketError} As {@link prepareOrder}; a locally invalid
   * order refuses the whole batch.
   */
  public async prepareOrders(
    orders: readonly PrepareOrderOptions[],
  ): Promise<PreparedOrder[]> {
    if (orders.length === 0) return [];
    const signer = this.__requireSigner();
    const funder = this.__requireFunder();
    for (const order of orders) Polymarket.__validateOrderInput(order);
    const uncachedTokenIds = [
      ...new Set(
        orders.filter((order) =>
          order.negRisk === undefined && order.version !== 3
        ).map((order) => order.tokenId),
      ),
    ];
    const negRiskByToken = new Map<string, boolean>();
    const needsVersion = orders.some((order) => order.version === undefined);
    const [version] = await Promise.all([
      needsVersion ? this.getVersion() : Promise.resolve(undefined),
      Promise.all(
        uncachedTokenIds.map(async (tokenId) => {
          negRiskByToken.set(tokenId, await this.getNegRisk(tokenId));
        }),
      ),
    ]);
    return await Promise.all(orders.map((order) =>
      this.__prepare(
        signer,
        funder,
        order.version ?? version!,
        order.version === 3
          ? false
          : order.negRisk ?? negRiskByToken.get(order.tokenId)!,
        order,
      )
    ));
  }

  /**
   * Send a {@link PreparedOrder} exactly as it was signed — never rebuilt,
   * never re-signed, so its `orderHash` stays the order's identity.
   *
   * Sending the same prepared order twice does not place it twice: the
   * CLOB rejects the second one (`INVALID_ORDER_DUPLICATED`, HTTP 400),
   * surfaced as `ORDER_DUPLICATE` — check the original's outcome with
   * {@link getOrder}`(orderHash)`.
   *
   * @throws {PolymarketError} `ORDER_VERSION_STALE` when the venue now
   * serves a different protocol version than the order was signed for
   * (prepare a new order — it will have a new hash), `ORDER_DUPLICATE`
   * when this order was already placed, `ORDER_REJECTED` for any other
   * rejection, `CONFIG_MISSING_PRIVATE_KEY` / `NO_API_CREDENTIALS`.
   */
  public async submitPrepared(order: PreparedOrder): Promise<OrderResult> {
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    const { response, parsed } = await this.__requestOrderResponse<
      ClobPostOrderResponse
    >(
      {
        path: '/order',
        baseURL: this.__clobBaseURL,
        method: 'POST',
        contentType: 'JSON',
        payload: Polymarket.__preparedBody(order, creds.apiKey),
        auth: this.__l2Auth(signer, creds),
      },
      (data) => ClobPostOrderResponseSchemaObject.parse(data),
    );
    if (this.__isVersionMismatch(response, parsed)) {
      throw await this.__staleError(order, response.status);
    }
    if (Polymarket.__isDuplicateEntry(response.status, parsed)) {
      throw new PolymarketError('ORDER_DUPLICATE', {
        orderHash: order.orderHash,
        status: response.status,
        detail: parsed.errorMsg,
      });
    }
    return {
      ...this.__toSubmitOrderResult(response, parsed, order.side, order.price),
      orderHash: order.orderHash,
    };
  }

  /**
   * Send many {@link PreparedOrder}s, {@link BULK_ORDER_CHUNK_SIZE} per
   * `POST /orders` (chunks run concurrently), each exactly as signed.
   * Never throws for a vendor-side outcome: every input maps to one result
   * in the same order, with `rejected`/`detail` set — and `rejectionCode`
   * `'VERSION_STALE'` (re-prepare it) or `'DUPLICATE'` (already placed)
   * where those apply.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` /
   * `NO_API_CREDENTIALS`, `RESPONSE_ERROR` for an anomalous response.
   */
  public async submitPreparedBatch(
    orders: readonly PreparedOrder[],
  ): Promise<OrderResult[]> {
    if (orders.length === 0) return [];
    const signer = this.__requireSigner();
    const creds = this.__requireApiCreds();
    const chunks: PreparedOrder[][] = [];
    for (let i = 0; i < orders.length; i += BULK_ORDER_CHUNK_SIZE) {
      chunks.push(orders.slice(i, i + BULK_ORDER_CHUNK_SIZE));
    }
    const results = await Promise.all(
      chunks.map((chunk) => this.__postPreparedChunk(signer, creds, chunk)),
    );
    return results.flat();
  }

  /**
   * Build, sign, and submit one marketable order — {@link prepareOrder}
   * then {@link submitPrepared}. On `order_version_mismatch` (the venue
   * serving a different protocol version than cached) it prepares a NEW
   * order (new salt, new hash) for the fresh version and submits that,
   * once — every other outcome (a fill, a partial fill, a graceful FAK/FOK
   * no-match, or a genuine rejection) is returned, not retried. Use
   * prepare/submit directly when the order's identity must be known before
   * it is sent.
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
    this.__requireSigner();
    this.__requireApiCreds();
    this.__requireFunder();
    const prepared = await this.prepareOrder(options);
    try {
      return await this.submitPrepared(prepared);
    } catch (err) {
      // `/version` names the CTF exchange, never ExchangeV3 — re-signing a
      // Protocol V2 order for it would only send it to the wrong exchange.
      if (
        !(err instanceof PolymarketError) ||
        err.code !== 'ORDER_VERSION_STALE' || prepared.version === 3
      ) {
        throw err;
      }
      const fresh = await this.prepareOrder({
        ...options,
        version: err.getContextValue('currentVersion') as ProtocolVersion,
        negRisk: prepared.negRisk,
      });
      try {
        return await this.submitPrepared(fresh);
      } catch (retryErr) {
        if (
          retryErr instanceof PolymarketError &&
          retryErr.code === 'ORDER_VERSION_STALE'
        ) {
          throw new PolymarketError('ORDER_VERSION_MISMATCH_PERSISTED', {
            status: retryErr.getContextValue('status'),
          });
        }
        throw retryErr;
      }
    }
  }

  /**
   * Build, sign, and submit up to {@link BULK_ORDER_CHUNK_SIZE} orders per
   * `POST /orders` call — {@link prepareOrders} then
   * {@link submitPreparedBatch}; larger inputs are chunked automatically,
   * every chunk submitted concurrently. A VENDOR-side rejection of one order
   * never throws and never discards any other order's outcome, in this
   * chunk or any other — each input maps to exactly one result, in the
   * same order, with `rejected`/`detail` set instead. This includes a
   * whole-chunk rejection (e.g. more than 15 orders, or an owner/signer
   * mismatch) and a version mismatch that survives its retry — both are
   * reported as per-row `rejected: true` results, never a thrown
   * exception, so one bad chunk can never discard another chunk's
   * genuine results.
   *
   * Only the orders that hit `order_version_mismatch` are re-prepared (a
   * new order, new hash) for the fresh version and resent — never a
   * sibling that already went through, which would risk a double fill.
   * Unlike `submitOrder`, this never throws
   * `ORDER_VERSION_MISMATCH_PERSISTED` — a persisted mismatch is a per-row
   * rejection here, for the same reason.
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
    this.__requireSigner();
    this.__requireApiCreds();
    this.__requireFunder();
    const prepared = await this.prepareOrders(orders);
    const results = await this.submitPreparedBatch(prepared);
    const stale = results.flatMap((r, i) =>
      r.rejectionCode === 'VERSION_STALE' && prepared[i]!.version !== 3
        ? [i]
        : []
    );
    if (stale.length === 0) return results;

    const freshVersion = await this.getVersion(true);
    const retried = await this.submitPreparedBatch(
      await this.prepareOrders(stale.map((i) => ({
        ...orders[i]!,
        version: freshVersion,
        negRisk: prepared[i]!.negRisk,
      }))),
    );
    stale.forEach((origIndex, j) => {
      const retry = retried[j]!;
      results[origIndex] = retry.rejectionCode === 'VERSION_STALE'
        ? {
          ...retry,
          detail:
            'order_version_mismatch persisted after refreshing the protocol version and retrying once',
        }
        : retry;
    });
    return results;
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
   * Routing follows the market's position system — spread
   * {@link positionMarket} in: a `v1` market goes through the CTF
   * collateral adapter `negRisk` picks, a `version: 'v2'` market through
   * the Protocol V2 Router (which needs the wallet's pUSD approved for
   * it).
   *
   * This moves real, on-chain funds and cannot be undone by this connect;
   * review `PolymarketRelayer.ts` yourself before trusting it with real
   * money — see the README's "Key custody" section.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` (also thrown
   * when `auth.funder` is unset) / `CONFIG_MISSING_RELAYER_CREDENTIALS`.
   */
  public async split(options: SplitMergeOptions): Promise<OrderResult> {
    const tx = options.version === 'v2'
      ? buildV2SplitTx(options.conditionId, options.amountUsd)
      : buildSplitTx(options.conditionId, options.amountUsd, options.negRisk);
    return await this.__submitRelayerTx('SPLIT', [tx], options.amountUsd);
  }

  /**
   * MERGE: the inverse of {@link split} — burns `amountUsd` of each
   * outcome pair and returns `amountUsd` pUSD. Same routing/risk notes as
   * `split`; on a `version: 'v2'` market the Router must be an approved
   * PositionManager operator for the wallet.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` / `CONFIG_MISSING_RELAYER_CREDENTIALS`.
   */
  public async merge(options: SplitMergeOptions): Promise<OrderResult> {
    const tx = options.version === 'v2'
      ? buildV2MergeTx(options.conditionId, options.amountUsd)
      : buildMergeTx(options.conditionId, options.amountUsd, options.negRisk);
    return await this.__submitRelayerTx('MERGE', [tx], options.amountUsd);
  }

  /**
   * REDEEM: convert a RESOLVED market's outcome shares back to pUSD
   * (winning shares pay $1 each, losing $0). Same routing/risk notes as
   * `split`.
   *
   * A `v1` market redeems the full held balance of both outcomes in one
   * call. The Protocol V2 Router redeems one outcome and an explicit
   * amount per call instead: a `version: 'v2'` redeem sends one call per
   * outcome holding shares, all in one meta-tx, for `options.shares` — or,
   * without it, the wallet's whole `CONDITIONAL-V2` balance of each
   * outcome, read with {@link getBalance} first. The Router must be an
   * approved PositionManager operator for the wallet.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_PRIVATE_KEY` /
   * `CONFIG_MISSING_RELAYER_CREDENTIALS`; `NO_API_CREDENTIALS` for a V2
   * redeem without `shares` before {@link deriveApiCredentials};
   * `INVALID_OPTIONS` when a V2 redeem has nothing to redeem.
   */
  public async redeem(options: RedeemOptions): Promise<OrderResult> {
    if (options.version !== 'v2') {
      const tx = buildRedeemTx(options.conditionId, options.negRisk);
      return await this.__submitRelayerTx('REDEEM', [tx], 0);
    }
    // Validate the relayer config before spending balance reads on it.
    this.__requireSigner();
    this.__requireFunder();
    this.__requireRelayerCredentials();
    const shares = options.shares ?? await Promise.all(
      [0, 1].map(async (outcomeIndex) =>
        (await this.getBalance({
          tokenId: v2PositionId(options.conditionId, outcomeIndex),
          version: 3,
        })).balance
      ),
    );
    let txs: ProxyTransaction[];
    try {
      txs = buildV2RedeemTxs(options.conditionId, shares);
    } catch (cause) {
      throw new PolymarketError('INVALID_OPTIONS', {
        method: 'redeem',
        detail: cause instanceof Error ? cause.message : String(cause),
      }, cause instanceof Error ? cause : undefined);
    }
    return await this.__submitRelayerTx('REDEEM', txs, 0);
  }

  /**
   * One relayed split/merge/redeem by the `id` its {@link OrderResult}
   * carries (`GET /transaction`) — poll it until `state` is
   * `STATE_CONFIRMED` before relying on the new balances; `STATE_FAILED`
   * and `STATE_INVALID` are terminal. This connect does not poll for you.
   *
   * @throws {PolymarketError} `CONFIG_MISSING_RELAYER_CREDENTIALS`;
   * `NOT_FOUND` for an unknown id; `RESPONSE_ERROR` when the body fails
   * validation.
   *
   * @example
   * ```typescript
   * const { id } = await client.split({ ...positionMarket(market), amountUsd: 1 });
   * const tx = await client.getRelayerTransaction(id);
   * console.log(tx.state, tx.transactionHash);
   * ```
   */
  public async getRelayerTransaction(
    transactionId: string,
  ): Promise<RelayerTransaction> {
    const { relayerApiKey, relayerApiKeyAddress } = this
      .__requireRelayerCredentials();
    const [tx] = await this.__requestAndValidate(
      {
        path: '/transaction',
        baseURL: this.__relayerBaseURL,
        method: 'GET',
        query: { id: transactionId },
        auth: this.__relayerAuth(relayerApiKey, relayerApiKeyAddress),
      },
      Guardian.array(RelayerTransactionSchemaObject),
    );
    if (!tx) throw new PolymarketError('NOT_FOUND', { status: 200, body: [] });
    return tx;
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
   * Builds a split/merge/redeem call, reporting a refused input (a
   * malformed condition id, an amount that is not above zero, nothing to
   * redeem) as `INVALID_OPTIONS` before any request is made.
   */
  private static __positionTx<T>(
    method: 'split' | 'merge' | 'redeem',
    build: () => T,
  ): T {
    try {
      return build();
    } catch (cause) {
      throw new PolymarketError('INVALID_OPTIONS', {
        method,
        detail: cause instanceof Error ? cause.message : String(cause),
      }, cause instanceof Error ? cause : undefined);
    }
  }

  /** The `/balance-allowance` query for collateral, a CTF token, or a Protocol V2 position. */
  private __balanceQuery(
    options: { tokenId?: string; version?: ProtocolVersion },
  ): Record<string, string> {
    const query: Record<string, string> = {
      asset_type: !options.tokenId
        ? 'COLLATERAL'
        : options.version === 3
        ? 'CONDITIONAL-V2'
        : 'CONDITIONAL',
      signature_type: String(this.__signatureType),
    };
    if (options.tokenId) query.token_id = options.tokenId;
    return query;
  }

  /** Sets each defined value as a query parameter, stringified. */
  private static __setQuery(
    query: Record<string, string>,
    values: Record<string, string | number | boolean | undefined>,
  ): void {
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) query[key] = String(value);
    }
  }

  /** Sets a comma-separated list parameter; an empty list sets nothing. */
  private static __setList(
    query: Record<string, string>,
    key: string,
    value: IdList | undefined,
  ): void {
    if (value === undefined) return;
    const joined = typeof value === 'string' ? value : value.join(',');
    if (joined !== '') query[key] = joined;
  }

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
    signer: DigestSigner,
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
  private __requireSigner(): DigestSigner {
    if (!this.__signer) throw new PolymarketError('CONFIG_MISSING_PRIVATE_KEY');
    return this.__signer;
  }

  /** Surfaces an injected signer's failure as a {@link PolymarketError}. */
  private static __guardSigner(signer: DigestSigner): DigestSigner {
    return {
      address: signer.address,
      async signDigest(digest) {
        try {
          return await signer.signDigest(digest);
        } catch (cause) {
          throw new PolymarketError(
            'SIGNER_FAILED',
            { detail: cause instanceof Error ? cause.message : String(cause) },
            cause instanceof Error ? cause : undefined,
          );
        }
      },
    };
  }

  /**
   * The CLOB L2 API credentials, from `auth.apiCredentials` or
   * {@link deriveApiCredentials}.
   *
   * @throws {PolymarketError} `NO_API_CREDENTIALS` when neither has happened.
   */
  private __requireApiCreds(): L2Credentials {
    const creds = this.__apiCreds;
    if (creds && this.__hmac) {
      return {
        apiKey: creds.apiKey,
        passphrase: creds.passphrase,
        hmac: this.__hmac,
      };
    }
    if (!creds?.secret) throw new PolymarketError('NO_API_CREDENTIALS');
    return {
      apiKey: creds.apiKey,
      passphrase: creds.passphrase,
      secret: creds.secret,
    };
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
    txs: readonly ProxyTransaction[],
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

    const envelope = await buildProxyMetaTx(
      signer,
      txs,
      relayPayload,
      funder,
    );

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
  private static __validateOrderInput(input: SubmitOrderOptions): void {
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

  /** Builds and signs one order — the shared step behind every prepare/submit method. */
  private async __prepare(
    signer: DigestSigner,
    funder: `0x${string}`,
    version: ProtocolVersion,
    negRisk: boolean,
    input: PrepareOrderOptions,
  ): Promise<PreparedOrder> {
    if (
      input.salt !== undefined &&
      (!Number.isSafeInteger(input.salt) || input.salt < 0)
    ) {
      throw new PolymarketError('ORDER_REJECTED', {
        detail: 'salt must be a non-negative integer below 2^53',
      });
    }
    if (
      input.nowMs !== undefined &&
      (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0)
    ) {
      throw new PolymarketError('ORDER_REJECTED', {
        detail: 'nowMs must be a non-negative integer (Unix milliseconds)',
      });
    }
    const built = buildOrder({
      version,
      negRisk,
      funder,
      signerAddress: signer.address,
      tokenId: input.tokenId,
      side: input.side,
      price: input.price,
      shares: input.shares,
      nowMs: input.nowMs ?? Date.now(),
      signatureType: this.__signatureType,
      expirationTime: input.expirationTime,
      salt: input.salt,
    });
    const signature = await signOrder(signer, built);
    return {
      orderHash: `0x${toHex(orderDigest(built))}`,
      salt: built.salt,
      version,
      negRisk,
      tokenId: input.tokenId,
      side: input.side,
      price: input.price,
      shares: input.shares,
      orderType: input.orderType,
      timestampMs: built.timestampMs,
      signature,
      order: orderWireJson(built, signature),
      ...(input.postOnly !== undefined && { postOnly: input.postOnly }),
      ...(input.deferExec !== undefined && { deferExec: input.deferExec }),
    };
  }

  /** The `POST /order(s)` body for one prepared order. `owner` is the API key — not part of the signature. */
  private static __preparedBody(
    order: PreparedOrder,
    owner: string,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      order: order.order,
      orderType: order.orderType,
      owner,
    };
    if (order.postOnly !== undefined) body.postOnly = order.postOnly;
    if (order.deferExec !== undefined) body.deferExec = order.deferExec;
    return body;
  }

  /** `ORDER_VERSION_STALE` for `order`, naming the version the venue serves now. */
  private async __staleError(
    order: PreparedOrder,
    status: number | null,
  ): Promise<PolymarketError> {
    let currentVersion: ProtocolVersion | undefined;
    try {
      currentVersion = await this.getVersion(true);
    } catch {
      currentVersion = undefined;
    }
    return new PolymarketError('ORDER_VERSION_STALE', {
      orderHash: order.orderHash,
      preparedVersion: order.version,
      currentVersion,
      status,
    });
  }

  /** Whether a rejection is the CLOB's `INVALID_ORDER_DUPLICATED`. */
  private static __isDuplicateEntry(
    status: number | null,
    entry: ClobPostOrderResponse,
  ): boolean {
    if (
      status !== null && status >= 200 && status < 300 &&
      entry.success !== false
    ) {
      return false;
    }
    const text = `${entry.code ?? ''} ${entry.errorMsg ?? ''}`.toLowerCase();
    return text.includes('duplicated');
  }

  /**
   * Posts one chunk (at most {@link BULK_ORDER_CHUNK_SIZE} prepared orders)
   * to `POST /orders` exactly as signed. Never throws for a vendor-side
   * outcome — a whole-chunk rejection becomes a per-row `rejected: true`
   * result, so one chunk's failure never discards another's outcomes.
   */
  private async __postPreparedChunk(
    signer: DigestSigner,
    creds: L2Credentials,
    chunk: readonly PreparedOrder[],
  ): Promise<OrderResult[]> {
    const { response, parsed } = await this.__requestOrderResponse<
      ClobPostOrderResponse[]
    >(
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
        payload: chunk.map((order) =>
          Polymarket.__preparedBody(order, creds.apiKey)
        ),
        auth: this.__l2Auth(signer, creds),
      } as unknown as RESTlerEndpoint,
      // A whole-chunk rejection (invalid payload, >15 orders, an
      // owner/signer mismatch) comes back as a single error OBJECT, not
      // an array — normalize it to a one-element array so parsing never
      // fails; the length mismatch below detects that shape.
      (data) =>
        (Array.isArray(data) ? data : [data]).map((entry) =>
          ClobPostOrderResponseSchemaObject.parse(entry)
        ),
    );
    const status = response.status ?? 0;
    const httpOk = status >= 200 && status < 300;
    let entries = parsed;
    if (!httpOk && parsed.length !== chunk.length) {
      // One error for the whole request — every order in this chunk was
      // refused, none partially.
      const one = parsed[0] ?? {};
      entries = chunk.map(() => ({ ...one, success: false }));
    }
    if (entries.length !== chunk.length) {
      // Anomalous vendor response shape — fail loudly and typed rather than
      // silently returning fewer results than orders submitted.
      throw new PolymarketError('RESPONSE_ERROR', {
        responseError:
          `expected ${chunk.length} bulk order results, got ${entries.length}`,
      });
    }
    return entries.map((entry, i) => {
      const order = chunk[i]!;
      const result: OrderResult = {
        ...this.__toBulkOrderResult(status, entry, order.side, order.price),
        orderHash: order.orderHash,
      };
      if (Polymarket.__isMismatchEntry(entry)) {
        result.rejectionCode = 'VERSION_STALE';
      } else if (
        Polymarket.__isDuplicateEntry(null, entry) && result.rejected
      ) {
        result.rejectionCode = 'DUPLICATE';
      }
      return result;
    });
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
   * Every request funnels through here, so a transport failure surfaces as
   * this connect's own error on every path: a timeout as `TIMEOUT`, a
   * failure before any response as `NETWORK_ERROR`, and an exhausted
   * RESTler rate-limit retry (`maxRetryWait`) as `RATE_LIMITED` — all
   * `transient`. A {@link PolymarketError} from the response handler passes
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
      return new PolymarketError('RATE_LIMITED', {
        status: 429,
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new PolymarketError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    // RESTlerResponseValidationError (and the two above) extend
    // RESTlerRequestError: only a bare one is a failure before any response.
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new PolymarketError('NETWORK_ERROR', {}, err);
    }
    return err;
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link PolymarketError}.
   */

  private async __requestAndValidate<B>(
    endpoint: RESTlerEndpoint,
    guard: Pick<BaseGuardian<B>, 'parse'>,
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
