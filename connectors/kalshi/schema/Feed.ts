import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Kalshi WebSocket (`/trade-api/ws/v2`) message payloads — the `msg` of
 * each frame. Field names follow this connect's REST schemas: the
 * fixed-point/dollar suffixes are dropped and the values coerced to
 * numbers (`count_fp: "136.00"` → `count: 136`, `yes_price_dollars:
 * "0.3600"` → `yesPrice: 0.36`). Every other wire key is camelCased and
 * passed through, so nothing the venue sends is lost.
 */

const camel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** camelCase every key, then apply `renames` (keyed by the wire name). */
function normalize(
  raw: unknown,
  renames: Record<string, string>,
): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return raw;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[renames[key] ?? camel(key)] = value;
  }
  return out;
}

const side = Guardian.enum(['yes', 'no'] as const);
const optionalString = Guardian.string().optional();
const optionalNumber = Guardian.number().optional();

// ── Order book ─────────────────────────────────────────────────────────────

/** One resting level: `count` contracts at `price` dollars. */
export type KalshiBookLevel = { price: number; count: number };

/**
 * A full order-book snapshot for one market — both sides at full depth.
 * Kalshi books hold bids only: a NO bid at `p` is a YES ask at `1 - p`.
 */
export type KalshiOrderbookSnapshot = {
  marketTicker: string;
  marketId?: string;
  /** YES bids. Empty when the side has none. */
  yes: KalshiBookLevel[];
  /** NO bids. Empty when the side has none. */
  no: KalshiBookLevel[];
};

const toLevels = (levels: unknown): unknown =>
  Array.isArray(levels)
    ? levels.map((l) => Array.isArray(l) ? { price: l[0], count: l[1] } : l)
    : levels;

/**
 * Schema for an `orderbook_snapshot` payload. The wire's
 * `yes_dollars_fp`/`no_dollars_fp` `[price, count]` string pairs become
 * `yes`/`no` level objects; a missing side becomes `[]`.
 *
 * @example
 * ```typescript
 * import { KalshiOrderbookSnapshotSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, book] = KalshiOrderbookSnapshotSchemaObject.safeParse({
 *   market_ticker: 'FED-23DEC-T3.00', market_id: '9b0f6b43-5b68-4f9f-9f02-9a2d1b8ac1a1',
 *   yes_dollars_fp: [['0.0800', '300.00']], no_dollars_fp: [['0.5400', '20.00']],
 * });
 * ```
 */
export const KalshiOrderbookSnapshotSchemaObject: BaseGuardian<
  KalshiOrderbookSnapshot
> = Guardian.preprocess(
  (raw: unknown) => {
    const o = normalize(raw, {
      yes_dollars_fp: 'yes',
      no_dollars_fp: 'no',
    }) as Record<string, unknown>;
    if (typeof o !== 'object' || o === null) return o;
    return { ...o, yes: toLevels(o.yes ?? []), no: toLevels(o.no ?? []) };
  },
  Guardian.object({
    marketTicker: Guardian.string().minLength(1),
    marketId: optionalString,
    yes: Guardian.array(
      Guardian.object({ price: Guardian.number(), count: Guardian.number() }),
    ),
    no: Guardian.array(
      Guardian.object({ price: Guardian.number(), count: Guardian.number() }),
    ),
  }).passthrough().describe({
    title: 'Kalshi orderbook snapshot',
    description: 'Full-depth YES and NO bids for one market.',
  }),
);

/** One level change: `delta` contracts (signed) at `price` on `side`. */
export type KalshiOrderbookDelta = {
  marketTicker: string;
  marketId?: string;
  /** Dollars. */
  price: number;
  /** Signed contract change. */
  delta: number;
  side: 'yes' | 'no';
  /** Present only when your own order caused the change. */
  clientOrderId?: string;
  /** Unix milliseconds. */
  tsMs?: number;
  subaccount?: number;
};

/**
 * Schema for an `orderbook_delta` payload.
 *
 * @example
 * ```typescript
 * import { KalshiOrderbookDeltaSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, delta] = KalshiOrderbookDeltaSchemaObject.safeParse({
 *   market_ticker: 'FED-23DEC-T3.00', price_dollars: '0.9600', delta_fp: '-54.00',
 *   side: 'yes', ts_ms: 1669149841000,
 * });
 * ```
 */
export const KalshiOrderbookDeltaSchemaObject: BaseGuardian<
  KalshiOrderbookDelta
> = Guardian.preprocess(
  (raw: unknown) =>
    normalize(raw, { price_dollars: 'price', delta_fp: 'delta' }),
  Guardian.object({
    marketTicker: Guardian.string().minLength(1),
    marketId: optionalString,
    price: Guardian.number(),
    delta: Guardian.number(),
    side,
    clientOrderId: optionalString,
    tsMs: optionalNumber,
    subaccount: optionalNumber,
  }).passthrough().describe({
    title: 'Kalshi orderbook delta',
    description: 'A signed contract change at one price level.',
  }),
);

// ── Public trades and ticker ───────────────────────────────────────────────

/** One public execution on the `trade` channel. */
export type KalshiFeedTrade = {
  tradeId: string;
  marketTicker: string;
  yesPrice: number;
  noPrice: number;
  count: number;
  takerSide?: 'yes' | 'no';
  takerOutcomeSide?: string;
  takerBookSide?: string;
  isBlockTrade?: boolean;
  /** Unix milliseconds. */
  tsMs?: number;
};

/**
 * Schema for a `trade` payload.
 *
 * @example
 * ```typescript
 * import { KalshiFeedTradeSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, trade] = KalshiFeedTradeSchemaObject.safeParse({
 *   trade_id: 'd91bc706-ee49-470d-82d8-11418bda6fed', market_ticker: 'HIGHNY-22DEC23-B53.5',
 *   yes_price_dollars: '0.3600', no_price_dollars: '0.6400', count_fp: '136.00',
 *   taker_side: 'no', ts_ms: 1669149841000,
 * });
 * ```
 */
export const KalshiFeedTradeSchemaObject: BaseGuardian<KalshiFeedTrade> =
  Guardian.preprocess(
    (raw: unknown) =>
      normalize(raw, {
        yes_price_dollars: 'yesPrice',
        no_price_dollars: 'noPrice',
        count_fp: 'count',
      }),
    Guardian.object({
      tradeId: Guardian.string().minLength(1),
      marketTicker: Guardian.string().minLength(1),
      yesPrice: Guardian.number(),
      noPrice: Guardian.number(),
      count: Guardian.number(),
      takerSide: side.optional(),
      takerOutcomeSide: optionalString,
      takerBookSide: optionalString,
      isBlockTrade: Guardian.boolean().strict().optional(),
      tsMs: optionalNumber,
    }).passthrough().describe({
      title: 'Kalshi feed trade',
      description: 'One public execution from the trade channel.',
    }),
  );

/** A market's ticker update (top of book, last price, volume). */
export type KalshiFeedTicker = {
  marketTicker: string;
  marketId?: string;
  /** Last traded price, dollars. */
  price: number;
  yesBid: number;
  yesAsk: number;
  volume?: number;
  openInterest?: number;
  yesBidSize?: number;
  yesAskSize?: number;
  lastTradeSize?: number;
  dollarVolume?: number;
  dollarOpenInterest?: number;
  /** Unix milliseconds. */
  tsMs?: number;
};

/**
 * Schema for a `ticker` payload.
 *
 * @example
 * ```typescript
 * import { KalshiFeedTickerSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, ticker] = KalshiFeedTickerSchemaObject.safeParse({
 *   market_ticker: 'FED-23DEC-T3.00', price_dollars: '0.4800', yes_bid_dollars: '0.4700',
 *   yes_ask_dollars: '0.4900', volume_fp: '1000.00', ts_ms: 1669149841000,
 * });
 * ```
 */
export const KalshiFeedTickerSchemaObject: BaseGuardian<KalshiFeedTicker> =
  Guardian.preprocess(
    (raw: unknown) =>
      normalize(raw, {
        price_dollars: 'price',
        yes_bid_dollars: 'yesBid',
        yes_ask_dollars: 'yesAsk',
        volume_fp: 'volume',
        open_interest_fp: 'openInterest',
        yes_bid_size_fp: 'yesBidSize',
        yes_ask_size_fp: 'yesAskSize',
        last_trade_size_fp: 'lastTradeSize',
      }),
    Guardian.object({
      marketTicker: Guardian.string().minLength(1),
      marketId: optionalString,
      price: Guardian.number(),
      yesBid: Guardian.number(),
      yesAsk: Guardian.number(),
      volume: optionalNumber,
      openInterest: optionalNumber,
      yesBidSize: optionalNumber,
      yesAskSize: optionalNumber,
      lastTradeSize: optionalNumber,
      dollarVolume: optionalNumber,
      dollarOpenInterest: optionalNumber,
      tsMs: optionalNumber,
    }).passthrough().describe({
      title: 'Kalshi feed ticker',
      description: 'Top of book, last price and volume for one market.',
    }),
  );

// ── Private: fills, orders, positions ──────────────────────────────────────

/** One of your fills. */
export type KalshiFeedFill = {
  tradeId: string;
  orderId: string;
  clientOrderId?: string;
  marketTicker: string;
  isTaker: boolean;
  side: 'yes' | 'no';
  yesPrice: number;
  count: number;
  /** Fee paid, dollars. */
  feeCost?: number;
  /** `buy` | `sell` | `sell_partial` | `sell_to_close` | `''`. */
  action?: string;
  /** Position after the fill. */
  postPosition?: number;
  purchasedSide?: string;
  outcomeSide?: string;
  bookSide?: string;
  exchangeIndex?: number;
  /** Unix milliseconds. */
  tsMs?: number;
  subaccount?: number;
};

/**
 * Schema for a `fill` payload.
 *
 * @example
 * ```typescript
 * import { KalshiFeedFillSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, fill] = KalshiFeedFillSchemaObject.safeParse({
 *   trade_id: 't', order_id: 'o', market_ticker: 'FED-23DEC-T3.00', is_taker: true,
 *   side: 'yes', yes_price_dollars: '0.3500', count_fp: '3.00', fee_cost: '0.02',
 *   action: 'buy', post_position_fp: '3.00', ts_ms: 1669149841000,
 * });
 * ```
 */
export const KalshiFeedFillSchemaObject: BaseGuardian<KalshiFeedFill> = Guardian
  .preprocess(
    (raw: unknown) =>
      normalize(raw, {
        yes_price_dollars: 'yesPrice',
        count_fp: 'count',
        post_position_fp: 'postPosition',
      }),
    Guardian.object({
      tradeId: Guardian.string().minLength(1),
      orderId: Guardian.string().minLength(1),
      clientOrderId: optionalString,
      marketTicker: Guardian.string().minLength(1),
      isTaker: Guardian.boolean().strict(),
      side,
      yesPrice: Guardian.number(),
      count: Guardian.number(),
      feeCost: optionalNumber,
      action: optionalString,
      postPosition: optionalNumber,
      purchasedSide: optionalString,
      outcomeSide: optionalString,
      bookSide: optionalString,
      exchangeIndex: optionalNumber,
      tsMs: optionalNumber,
      subaccount: optionalNumber,
    }).passthrough().describe({
      title: 'Kalshi feed fill',
      description: 'One of the account’s fills.',
    }),
  );

/** An update to one of your orders. */
export type KalshiFeedUserOrder = {
  orderId: string;
  ticker: string;
  /** `resting` | `canceled` | `executed` | ... */
  status: string;
  side: 'yes' | 'no';
  outcomeSide?: string;
  bookSide?: string;
  yesPrice: number;
  fillCount?: number;
  remainingCount?: number;
  initialCount?: number;
  takerFillCost?: number;
  makerFillCost?: number;
  takerFees?: number;
  makerFees?: number;
  clientOrderId?: string;
  /** Unix milliseconds. */
  createdTsMs?: number;
  /** Unix milliseconds. */
  lastUpdatedTsMs?: number;
  /** `Trade` | `Amend` | `Decrease` | `ExpiryCancel` | ... */
  lastUpdateReason?: string;
};

/**
 * Schema for a `user_order` payload. `created_ts_ms: null` (documented as
 * nullable) normalizes to absent.
 *
 * @example
 * ```typescript
 * import { KalshiFeedUserOrderSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, order] = KalshiFeedUserOrderSchemaObject.safeParse({
 *   order_id: 'ee587a1c', ticker: 'FED-23DEC-T3.00', status: 'resting', side: 'yes',
 *   yes_price_dollars: '0.3500', remaining_count_fp: '10.00', fill_count_fp: '0.00',
 *   initial_count_fp: '10.00', client_order_id: 'c1', created_ts_ms: 1669149841000,
 * });
 * ```
 */
export const KalshiFeedUserOrderSchemaObject: BaseGuardian<
  KalshiFeedUserOrder
> = Guardian.preprocess(
  (raw: unknown) => {
    const o = normalize(raw, {
      yes_price_dollars: 'yesPrice',
      fill_count_fp: 'fillCount',
      remaining_count_fp: 'remainingCount',
      initial_count_fp: 'initialCount',
      taker_fill_cost_dollars: 'takerFillCost',
      maker_fill_cost_dollars: 'makerFillCost',
      taker_fees_dollars: 'takerFees',
      maker_fees_dollars: 'makerFees',
    });
    if (typeof o !== 'object' || o === null) return o;
    const r = { ...(o as Record<string, unknown>) };
    for (const key of ['createdTsMs', 'createdTime', 'clientOrderId']) {
      if (r[key] === null) delete r[key];
    }
    return r;
  },
  Guardian.object({
    orderId: Guardian.string().minLength(1),
    ticker: Guardian.string().minLength(1),
    status: Guardian.string(),
    side,
    outcomeSide: optionalString,
    bookSide: optionalString,
    yesPrice: Guardian.number(),
    fillCount: optionalNumber,
    remainingCount: optionalNumber,
    initialCount: optionalNumber,
    takerFillCost: optionalNumber,
    makerFillCost: optionalNumber,
    takerFees: optionalNumber,
    makerFees: optionalNumber,
    clientOrderId: optionalString,
    createdTsMs: optionalNumber,
    lastUpdatedTsMs: optionalNumber,
    lastUpdateReason: optionalString,
  }).passthrough().describe({
    title: 'Kalshi feed user order',
    description: 'An update to one of the account’s orders.',
  }),
);

/** Your position in one market after a change. */
export type KalshiFeedMarketPosition = {
  marketTicker: string;
  userId?: string;
  /** Net contracts (negative: NO). */
  position: number;
  positionCost?: number;
  realizedPnl?: number;
  feesPaid?: number;
  positionFeeCost?: number;
  volume?: number;
  subaccount?: number;
};

/**
 * Schema for a `market_position` payload.
 *
 * @example
 * ```typescript
 * import { KalshiFeedMarketPositionSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, position] = KalshiFeedMarketPositionSchemaObject.safeParse({
 *   user_id: 'u', market_ticker: 'FED-23DEC-T3.00', position_fp: '10.00',
 *   position_cost_dollars: '3.5000', realized_pnl_dollars: '0.0000',
 *   fees_paid_dollars: '0.0200', volume_fp: '10.00',
 * });
 * ```
 */
export const KalshiFeedMarketPositionSchemaObject: BaseGuardian<
  KalshiFeedMarketPosition
> = Guardian.preprocess(
  (raw: unknown) =>
    normalize(raw, {
      position_fp: 'position',
      position_cost_dollars: 'positionCost',
      realized_pnl_dollars: 'realizedPnl',
      fees_paid_dollars: 'feesPaid',
      position_fee_cost_dollars: 'positionFeeCost',
      volume_fp: 'volume',
    }),
  Guardian.object({
    marketTicker: Guardian.string().minLength(1),
    userId: optionalString,
    position: Guardian.number(),
    positionCost: optionalNumber,
    realizedPnl: optionalNumber,
    feesPaid: optionalNumber,
    positionFeeCost: optionalNumber,
    volume: optionalNumber,
    subaccount: optionalNumber,
  }).passthrough().describe({
    title: 'Kalshi feed market position',
    description: 'The account’s position in one market after a change.',
  }),
);
