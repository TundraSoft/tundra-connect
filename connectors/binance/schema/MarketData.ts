import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Binance spot market-data stream payloads. Binance's single-letter keys
 * are case-sensitive (`e`/`E`, `t`/`T`, `b`/`B`, `m`/`M`), so each schema
 * renames exactly the documented ones to readable names and passes every
 * other key through untouched. Decimal strings become numbers; timestamps
 * keep the unit the connection asked for (milliseconds by default,
 * microseconds with `timeUnit: 'MICROSECOND'`).
 */

function rename(raw: unknown, names: Record<string, string>): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return raw;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[names[key] ?? key] = value;
  }
  return out;
}

// ── <symbol>@trade ─────────────────────────────────────────────────────────

/** One raw trade — every individual print, not aggregated. */
export type BinanceTrade = {
  eventType: 'trade';
  /** Event time (`E`). */
  eventTime: number;
  /** Upper-case symbol, e.g. `BTCUSDT`. */
  symbol: string;
  /** Trade id (`t`) — consecutive per symbol, so a jump is a missed trade. */
  tradeId: number;
  price: number;
  quantity: number;
  /** Trade time (`T`). */
  tradeTime: number;
  /** `m`: the buyer was the maker, i.e. the taker SOLD. */
  buyerIsMaker: boolean;
};

/**
 * Schema for a `trade` stream payload.
 *
 * @example
 * ```typescript
 * import { BinanceTradeSchemaObject } from '@tundraconnect/binance/schemas';
 *
 * const [error, trade] = BinanceTradeSchemaObject.safeParse({
 *   e: 'trade', E: 1792414402540, s: 'BTCUSDT', t: 6774582213, p: '82568.01000000',
 *   q: '0.01210000', T: 1792414402540, m: false, M: true,
 * });
 * ```
 */
export const BinanceTradeSchemaObject: BaseGuardian<BinanceTrade> = Guardian
  .preprocess(
    (raw: unknown) =>
      rename(raw, {
        e: 'eventType',
        E: 'eventTime',
        s: 'symbol',
        t: 'tradeId',
        p: 'price',
        q: 'quantity',
        T: 'tradeTime',
        m: 'buyerIsMaker',
      }),
    Guardian.object({
      eventType: Guardian.literal('trade'),
      eventTime: Guardian.number().strict(),
      symbol: Guardian.string().minLength(1),
      tradeId: Guardian.number().strict(),
      price: Guardian.number(),
      quantity: Guardian.number(),
      tradeTime: Guardian.number().strict(),
      buyerIsMaker: Guardian.boolean().strict(),
    }).passthrough().describe({
      title: 'Binance trade',
      description: 'One raw trade from the `<symbol>@trade` stream.',
    }),
  );

// ── <symbol>@bookTicker ────────────────────────────────────────────────────

/** Best bid/ask, pushed on every top-of-book change. */
export type BinanceBookTicker = {
  /** Order-book update id (`u`). Not consecutive across messages. */
  updateId: number;
  symbol: string;
  bidPrice: number;
  bidQuantity: number;
  askPrice: number;
  askQuantity: number;
};

/**
 * Schema for a `bookTicker` stream payload. Spot book tickers carry no
 * event time; the event's `receivedAt` is the only clock.
 *
 * @example
 * ```typescript
 * import { BinanceBookTickerSchemaObject } from '@tundraconnect/binance/schemas';
 *
 * const [error, top] = BinanceBookTickerSchemaObject.safeParse({
 *   u: 101631018582, s: 'BTCUSDT', b: '82568.00000000', B: '0.42853000',
 *   a: '82568.01000000', A: '8.09289000',
 * });
 * ```
 */
export const BinanceBookTickerSchemaObject: BaseGuardian<BinanceBookTicker> =
  Guardian.preprocess(
    (raw: unknown) =>
      rename(raw, {
        u: 'updateId',
        s: 'symbol',
        b: 'bidPrice',
        B: 'bidQuantity',
        a: 'askPrice',
        A: 'askQuantity',
      }),
    Guardian.object({
      updateId: Guardian.number().strict(),
      symbol: Guardian.string().minLength(1),
      bidPrice: Guardian.number(),
      bidQuantity: Guardian.number(),
      askPrice: Guardian.number(),
      askQuantity: Guardian.number(),
    }).passthrough().describe({
      title: 'Binance book ticker',
      description: 'Best bid and ask from the `<symbol>@bookTicker` stream.',
    }),
  );

// ── <symbol>@depth@100ms ───────────────────────────────────────────────────

/** One changed level: the NEW `quantity` at `price` (`0` removes the level). */
export type BinanceDepthLevel = { price: number; quantity: number };

/** Every order-book change in the last 100ms, at full depth. */
export type BinanceDepthUpdate = {
  eventType: 'depthUpdate';
  eventTime: number;
  symbol: string;
  /** First update id in this event (`U`). */
  firstUpdateId: number;
  /** Last update id in this event (`u`). The next event's `firstUpdateId` must be this + 1. */
  finalUpdateId: number;
  bids: BinanceDepthLevel[];
  asks: BinanceDepthLevel[];
};

const toLevels = (levels: unknown): unknown =>
  Array.isArray(levels)
    ? levels.map((l) => Array.isArray(l) ? { price: l[0], quantity: l[1] } : l)
    : levels;

const _level = Guardian.object({
  price: Guardian.number(),
  quantity: Guardian.number(),
});

/**
 * Schema for a `depthUpdate` (diff depth) stream payload. The wire's
 * `[price, quantity]` string pairs become level objects.
 *
 * @example
 * ```typescript
 * import { BinanceDepthUpdateSchemaObject } from '@tundraconnect/binance/schemas';
 *
 * const [error, depth] = BinanceDepthUpdateSchemaObject.safeParse({
 *   e: 'depthUpdate', E: 1792414402514, s: 'BTCUSDT', U: 101631018542, u: 101631018579,
 *   b: [['82568.00000000', '0.42853000']], a: [],
 * });
 * ```
 */
export const BinanceDepthUpdateSchemaObject: BaseGuardian<BinanceDepthUpdate> =
  Guardian.preprocess(
    (raw: unknown) => {
      const o = rename(raw, {
        e: 'eventType',
        E: 'eventTime',
        s: 'symbol',
        U: 'firstUpdateId',
        u: 'finalUpdateId',
        b: 'bids',
        a: 'asks',
      });
      if (typeof o !== 'object' || o === null) return o;
      const r = o as Record<string, unknown>;
      return { ...r, bids: toLevels(r.bids), asks: toLevels(r.asks) };
    },
    Guardian.object({
      eventType: Guardian.literal('depthUpdate'),
      eventTime: Guardian.number().strict(),
      symbol: Guardian.string().minLength(1),
      firstUpdateId: Guardian.number().strict(),
      finalUpdateId: Guardian.number().strict(),
      bids: Guardian.array(_level),
      asks: Guardian.array(_level),
    }).passthrough().describe({
      title: 'Binance depth update',
      description:
        'Order-book level changes from the `<symbol>@depth@100ms` stream.',
    }),
  );
