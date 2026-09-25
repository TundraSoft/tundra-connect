import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Read-side CLOB schemas: open orders, the account's own trades (fills),
 * and the public order book. Every vendor field is snake_case on the wire
 * and normalized here to this connect's camelCase; decimal-string numbers
 * (`price`, `size`, ...) are coerced to `number`. `.passthrough()` keeps
 * any unmodeled vendor field on the parsed object.
 */

/** Normalizes a vendor page envelope — or a bare array, which older deployments return — to `{ data, nextCursor?, count? }`. */
function toPage(raw: unknown): unknown {
  if (Array.isArray(raw)) return { data: raw };
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const cursor = obj.next_cursor ?? obj.nextCursor;
  return {
    data: obj.data ?? [],
    count: obj.count,
    // `''` and `'LTE='` (base64 for `-1`) are both the vendor's "no more pages".
    nextCursor: typeof cursor === 'string' && cursor !== '' && cursor !== 'LTE='
      ? cursor
      : undefined,
  };
}

const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// ── Open orders ───────────────────────────────────────────────────────────

/** One resting (or recently settled) order as returned by `GET /data/orders`. */
export type ClobOpenOrder = {
  /** Order id (hash). */
  id: string;
  /** `LIVE` | `MATCHED` | `CANCELED` | `CANCELED_MARKET_RESOLVED` | `INVALID`. */
  status: string;
  /** Owner (API-key) UUID. */
  owner: string;
  makerAddress: string;
  /** Condition id. */
  market: string;
  /** Token id. */
  assetId: string;
  side: 'BUY' | 'SELL';
  /** Shares, already normalized (not base units). */
  originalSize: number;
  /** Shares matched so far — retained after cancellation. */
  sizeMatched: number;
  price: number;
  outcome: string;
  /** Unix seconds; `0` means good-till-cancelled. */
  expiration: number;
  /** `GTC` | `GTD` | `FOK` | `FAK`. */
  orderType: string;
  associateTrades: string[];
  /** Unix seconds. */
  createdAt: number;
};

const _openOrder = Guardian.object({
  id: Guardian.string().minLength(1),
  status: Guardian.string(),
  owner: Guardian.string(),
  makerAddress: Guardian.string(),
  market: Guardian.string(),
  assetId: Guardian.string(),
  side: Guardian.enum(['BUY', 'SELL'] as const),
  originalSize: Guardian.number(),
  sizeMatched: Guardian.number(),
  price: Guardian.number(),
  outcome: Guardian.string(),
  expiration: Guardian.number(),
  orderType: Guardian.string(),
  associateTrades: Guardian.array(Guardian.string()),
  createdAt: Guardian.number(),
}).passthrough().describe({
  title: 'CLOB open order',
  description:
    'One order from the authenticated account, as `GET /data/orders` returns it.',
});

/**
 * Schema for one `GET /data/orders` row.
 *
 * @example
 * ```typescript
 * import { ClobOpenOrderSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, order] = ClobOpenOrderSchemaObject.safeParse({
 *   id: '0xabc', status: 'LIVE', owner: 'uuid', maker_address: '0x1', market: '0xc',
 *   asset_id: '1', side: 'BUY', original_size: '10', size_matched: '0', price: '0.52',
 *   outcome: 'Yes', expiration: '0', order_type: 'GTC', created_at: 1748779200,
 * });
 * ```
 */
export const ClobOpenOrderSchemaObject: BaseGuardian<ClobOpenOrder> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const o = raw as Record<string, unknown>;
      return {
        ...o,
        makerAddress: o.maker_address ?? o.makerAddress,
        assetId: o.asset_id ?? o.assetId,
        originalSize: num(o.original_size ?? o.originalSize),
        sizeMatched: num(o.size_matched ?? o.sizeMatched),
        price: num(o.price),
        expiration: num(o.expiration),
        orderType: o.order_type ?? o.orderType,
        associateTrades: o.associate_trades ?? o.associateTrades ?? [],
        createdAt: num(o.created_at ?? o.createdAt),
      };
    },
    _openOrder,
  );

/** One page of {@link ClobOpenOrder}s. */
export type ClobOpenOrdersPage = {
  data: ClobOpenOrder[];
  /** Pass back as `cursor` to fetch the next page; absent on the last page. */
  nextCursor?: string;
  count?: number;
};

/**
 * Schema for the `GET /data/orders` page envelope. Accepts either the
 * documented `{ data, next_cursor, count, limit }` object or a bare array
 * (which some deployments still return); `next_cursor` of `''`/`'LTE='`
 * normalizes to an absent `nextCursor`.
 *
 * @example
 * ```typescript
 * import { ClobOpenOrdersPageSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, page] = ClobOpenOrdersPageSchemaObject.safeParse({ data: [], next_cursor: 'LTE=', count: 0 });
 * ```
 */
export const ClobOpenOrdersPageSchemaObject: BaseGuardian<ClobOpenOrdersPage> =
  Guardian.preprocess(
    toPage,
    Guardian.object({
      data: Guardian.array(ClobOpenOrderSchemaObject),
      nextCursor: Guardian.string().optional(),
      count: Guardian.number().optional(),
    }).describe({
      title: 'CLOB open-orders page',
      description: 'A cursor-paginated page of the account’s orders.',
    }),
  );

// ── Trades (fills) ────────────────────────────────────────────────────────

/** One of the account's own executions as returned by `GET /data/trades`. */
export type ClobTrade = {
  id: string;
  takerOrderId: string;
  market: string;
  assetId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  feeRateBps: number;
  /** `TRADE_STATUS_MATCHED` | `TRADE_STATUS_MINED` | `TRADE_STATUS_CONFIRMED` | `TRADE_STATUS_RETRYING` | `TRADE_STATUS_FAILED`. */
  status: string;
  /** Unix seconds. */
  matchTime: number;
  /** Unix seconds. */
  lastUpdate: number;
  outcome: string;
  bucketIndex: number;
  owner: string;
  makerAddress: string;
  transactionHash?: string;
  /** Whether this account was the `TAKER` or a `MAKER` on the trade. */
  traderSide: 'TAKER' | 'MAKER';
  /** Raw vendor maker-order rows (`order_id`, `maker_address`, `matched_amount`, ...). */
  makerOrders: Record<string, unknown>[];
};

const _trade = Guardian.object({
  id: Guardian.string().minLength(1),
  takerOrderId: Guardian.string(),
  market: Guardian.string(),
  assetId: Guardian.string(),
  side: Guardian.enum(['BUY', 'SELL'] as const),
  size: Guardian.number(),
  price: Guardian.number(),
  feeRateBps: Guardian.number(),
  status: Guardian.string(),
  matchTime: Guardian.number(),
  lastUpdate: Guardian.number(),
  outcome: Guardian.string(),
  bucketIndex: Guardian.number(),
  owner: Guardian.string(),
  makerAddress: Guardian.string(),
  transactionHash: Guardian.string().optional(),
  traderSide: Guardian.enum(['TAKER', 'MAKER'] as const),
  makerOrders: Guardian.array(
    Guardian.record(Guardian.string(), Guardian.unknown()),
  ),
}).passthrough().describe({
  title: 'CLOB trade',
  description:
    'One execution involving the authenticated account, as `GET /data/trades` returns it.',
});

/**
 * Schema for one `GET /data/trades` row.
 *
 * @example
 * ```typescript
 * import { ClobTradeSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, trade] = ClobTradeSchemaObject.safeParse({
 *   id: 't1', taker_order_id: '0xo', market: '0xc', asset_id: '1', side: 'BUY',
 *   size: '10', price: '0.52', fee_rate_bps: '0', status: 'TRADE_STATUS_MATCHED',
 *   match_time: '1748779205', last_update: '1748779205', outcome: 'Yes',
 *   bucket_index: 0, owner: 'uuid', maker_address: '0x1', trader_side: 'TAKER',
 * });
 * ```
 */
export const ClobTradeSchemaObject: BaseGuardian<ClobTrade> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const o = raw as Record<string, unknown>;
      return {
        ...o,
        takerOrderId: o.taker_order_id ?? o.takerOrderId,
        assetId: o.asset_id ?? o.assetId,
        size: num(o.size),
        price: num(o.price),
        feeRateBps: num(o.fee_rate_bps ?? o.feeRateBps),
        matchTime: num(o.match_time ?? o.matchTime),
        lastUpdate: num(o.last_update ?? o.lastUpdate),
        bucketIndex: num(o.bucket_index ?? o.bucketIndex),
        makerAddress: o.maker_address ?? o.makerAddress,
        transactionHash: o.transaction_hash ?? o.transactionHash ?? undefined,
        traderSide: o.trader_side ?? o.traderSide,
        makerOrders: o.maker_orders ?? o.makerOrders ?? [],
      };
    },
    _trade,
  );

/** One page of {@link ClobTrade}s. */
export type ClobTradesPage = {
  data: ClobTrade[];
  /** Pass back as `cursor` to fetch the next page; absent on the last page. */
  nextCursor?: string;
  count?: number;
};

/**
 * Schema for the `GET /data/trades` page envelope — same normalization as
 * {@link ClobOpenOrdersPageSchemaObject}.
 *
 * @example
 * ```typescript
 * import { ClobTradesPageSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, page] = ClobTradesPageSchemaObject.safeParse({ data: [], next_cursor: '' });
 * ```
 */
export const ClobTradesPageSchemaObject: BaseGuardian<ClobTradesPage> = Guardian
  .preprocess(
    toPage,
    Guardian.object({
      data: Guardian.array(ClobTradeSchemaObject),
      nextCursor: Guardian.string().optional(),
      count: Guardian.number().optional(),
    }).describe({
      title: 'CLOB trades page',
      description: 'A cursor-paginated page of the account’s trades.',
    }),
  );

// ── Order book ────────────────────────────────────────────────────────────

/** One price level of a {@link ClobOrderBook}. */
export type ClobOrderBookLevel = { price: number; size: number };

/** A public order-book snapshot for one token, as `GET /book` returns it. */
export type ClobOrderBook = {
  /** Condition id. */
  market: string;
  /** Token id. */
  assetId: string;
  /** Unix milliseconds. */
  timestamp: number;
  /** Snapshot hash. */
  hash: string;
  /** Bids — the vendor sorts these ascending by price (best bid LAST). */
  bids: ClobOrderBookLevel[];
  /** Asks — the vendor sorts these descending by price (best ask LAST). */
  asks: ClobOrderBookLevel[];
  minOrderSize: number;
  tickSize: number;
  negRisk: boolean;
  lastTradePrice: number;
};

const _level = Guardian.preprocess(
  (raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const o = raw as Record<string, unknown>;
    return { price: num(o.price), size: num(o.size) };
  },
  Guardian.object({ price: Guardian.number(), size: Guardian.number() }),
);

const _orderBook = Guardian.object({
  market: Guardian.string(),
  assetId: Guardian.string(),
  timestamp: Guardian.number(),
  hash: Guardian.string(),
  bids: Guardian.array(_level),
  asks: Guardian.array(_level),
  minOrderSize: Guardian.number(),
  tickSize: Guardian.number(),
  negRisk: Guardian.boolean(),
  lastTradePrice: Guardian.number(),
}).passthrough().describe({
  title: 'CLOB order book',
  description: 'Aggregated bid/ask levels for one token.',
});

/**
 * Schema for the CLOB's `GET /book` response. Level arrays keep the
 * vendor's own ordering (bids ascending, asks descending — best price
 * last on both sides), so `bids.at(-1)`/`asks.at(-1)` are the touch.
 *
 * @example
 * ```typescript
 * import { ClobOrderBookSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, book] = ClobOrderBookSchemaObject.safeParse({
 *   market: '0xc', asset_id: '1', timestamp: '1782753357257', hash: 'h',
 *   bids: [{ price: '0.01', size: '100' }], asks: [{ price: '0.99', size: '50' }],
 *   min_order_size: '5', tick_size: '0.01', neg_risk: false, last_trade_price: '0.5',
 * });
 * ```
 */
export const ClobOrderBookSchemaObject: BaseGuardian<ClobOrderBook> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const o = raw as Record<string, unknown>;
      return {
        ...o,
        assetId: o.asset_id ?? o.assetId,
        timestamp: num(o.timestamp),
        bids: o.bids ?? [],
        asks: o.asks ?? [],
        minOrderSize: num(o.min_order_size ?? o.minOrderSize),
        tickSize: num(o.tick_size ?? o.tickSize, 0.01),
        negRisk: Boolean(o.neg_risk ?? o.negRisk),
        lastTradePrice: num(o.last_trade_price ?? o.lastTradePrice),
      };
    },
    _orderBook,
  );
