import { type BaseGuardian, Guardian } from '@guardian';
import { camelizeKeys } from './camelizeKeys.ts';

/**
 * PolyBolt (`wss://ws-live-v2.polymarket.com/ws`) messages — Chainlink/Pyth
 * crypto, equity (stocks, ETFs, forex, metals, commodities), the
 * Chainlink 60-second TWAP channels and Polymarket top-of-book. Keys are
 * camelCased and every unmodelled field passes through.
 * `fullAccuracyValue` stays a string: it is the exact decimal the source
 * published, the value to record when a market settles on it.
 */

// ── PolyBolt ───────────────────────────────────────────────────────────────

/** `open` | `closed` | `unknown` — the producer's own statement about the priced instrument's market. Absent means not stated, never open. */
export type PolymarketMarketStatus = 'open' | 'closed' | 'unknown';

/** One historical point inside a PolyBolt snapshot batch (no symbol/source — those are on the batch). */
export type PolymarketPricePoint = {
  value: number;
  fullAccuracyValue: string;
  /** Source event time, Unix milliseconds. */
  timestamp: number;
};

/**
 * A live PolyBolt price — `price.crypto`, `price.equity`, or their
 * `.twap` channels. Every update is delivered, including a status-only
 * change that repeats the last price and `timestamp` with
 * `isCarriedForward: true` — never de-duplicate on `timestamp`.
 */
export type PolymarketPriceUpdate = {
  symbol: string;
  value: number;
  /** Exact decimal as published — prefer it over `value`. */
  fullAccuracyValue: string;
  /** Source event time, Unix milliseconds. */
  timestamp: number;
  /**
   * The vendor that produced this price: `chainlink`, `pyth` or `massive`
   * today, but treat the set as open. A symbol's vendor can change between
   * connections (and briefly mid-roll), so read it on every point.
   */
  source: string;
  /** TWAP channels only: the averaging window, seconds (60). */
  windowSeconds?: number;
  /** Equity only: ingest receive time, Unix milliseconds. */
  receivedAt?: number;
  /** Equity only: repeats an already-measured price (closed session, or a status change). */
  isCarriedForward?: boolean;
  /** Equity channels only (since 2026-10-21); absent when the producer states nothing. */
  marketStatus?: PolymarketMarketStatus;
};

/** The snapshot sent once per new PolyBolt subscription: up to two minutes of history. */
export type PolymarketPriceSnapshot = {
  symbol: string;
  /** The vendor behind every point in the batch — re-read it after each reconnect. */
  source: string;
  windowSeconds?: number;
  /**
   * Equity channels: the series' current status. While `closed` or
   * `unknown`, `data` also holds the last price even when it is older than
   * two minutes (the price the market stopped at).
   */
  marketStatus?: PolymarketMarketStatus;
  data: PolymarketPricePoint[];
};

/** A `price.polymarket` top-of-book update. */
export type PolymarketPriceBestBidAsk = {
  market: string;
  assetId: string;
  bestBid: number;
  bestAsk: number;
  hash: string;
  /** Order-book time, Unix milliseconds. */
  timestamp: number;
};

/** The PolyBolt delivery envelope around every payload. */
export type PolymarketPriceEnvelope = {
  v: number;
  channel: string;
  /** Dense per connection and channel; resets on reconnect. */
  seq: number;
  /** Producer event time, Unix milliseconds. */
  ts: number;
  snapshot?: boolean;
  /** Frames the server dropped on this channel since the last delivered one. */
  dropped?: number;
  /** Validated separately, by channel and `snapshot` (typed `unknown`, so optional to the type system). */
  payload?: unknown;
};

const _point = Guardian.object({
  symbol: Guardian.string(),
  value: Guardian.number(),
  fullAccuracyValue: Guardian.string(),
  timestamp: Guardian.number(),
  source: Guardian.string(),
  windowSeconds: Guardian.number().optional(),
  receivedAt: Guardian.number().optional(),
  isCarriedForward: Guardian.boolean().strict().optional(),
  marketStatus: Guardian.enum(['open', 'closed', 'unknown'] as const)
    .optional(),
}).passthrough();

/**
 * Schema for a live PolyBolt price payload.
 *
 * @example
 * ```typescript
 * import { PolymarketPriceUpdateSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, price] = PolymarketPriceUpdateSchemaObject.safeParse({
 *   symbol: 'btcusd', value: 78794.15, full_accuracy_value: '78794.15450441',
 *   timestamp: 1788886177000, source: 'chainlink',
 * });
 * ```
 */
export const PolymarketPriceUpdateSchemaObject: BaseGuardian<
  PolymarketPriceUpdate
> = Guardian.preprocess(
  camelizeKeys,
  _point.describe({
    title: 'PolyBolt price',
    description:
      'A live crypto, equity or TWAP reference price, with its producing vendor and (equity) market status.',
  }),
);

/**
 * Schema for a PolyBolt snapshot batch payload.
 *
 * @example
 * ```typescript
 * import { PolymarketPriceSnapshotSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, batch] = PolymarketPriceSnapshotSchemaObject.safeParse({
 *   symbol: 'btcusd', source: 'chainlink',
 *   data: [{ value: 78794.15, full_accuracy_value: '78794.15', timestamp: 1788886177000 }],
 * });
 * ```
 */
export const PolymarketPriceSnapshotSchemaObject: BaseGuardian<
  PolymarketPriceSnapshot
> = Guardian.preprocess(
  camelizeKeys,
  Guardian.object({
    symbol: Guardian.string(),
    source: Guardian.string(),
    windowSeconds: Guardian.number().optional(),
    marketStatus: Guardian.enum(['open', 'closed', 'unknown'] as const)
      .optional(),
    data: Guardian.array(
      Guardian.object({
        value: Guardian.number(),
        fullAccuracyValue: Guardian.string(),
        timestamp: Guardian.number(),
      }).passthrough(),
    ),
  }).passthrough().describe({
    title: 'PolyBolt price snapshot',
    description: 'The history batch sent once per new price subscription.',
  }),
);

/**
 * Schema for a `price.polymarket` top-of-book payload.
 *
 * @example
 * ```typescript
 * import { PolymarketPriceBestBidAskSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, top] = PolymarketPriceBestBidAskSchemaObject.safeParse({
 *   market: '0xabc', asset_id: '1', best_bid: '0.08', best_ask: '0.09',
 *   hash: 'h', timestamp: 1788886177000,
 * });
 * ```
 */
export const PolymarketPriceBestBidAskSchemaObject: BaseGuardian<
  PolymarketPriceBestBidAsk
> = Guardian.preprocess(
  camelizeKeys,
  Guardian.object({
    market: Guardian.string(),
    assetId: Guardian.string(),
    bestBid: Guardian.number(),
    bestAsk: Guardian.number(),
    hash: Guardian.string(),
    timestamp: Guardian.number(),
  }).passthrough().describe({
    title: 'PolyBolt best bid/ask',
    description: 'Top-of-book for one outcome token on `price.polymarket`.',
  }),
);

/**
 * Schema for the PolyBolt envelope (payload validated separately, by
 * channel and snapshot flag).
 *
 * @example
 * ```typescript
 * import { PolymarketPriceEnvelopeSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, envelope] = PolymarketPriceEnvelopeSchemaObject.safeParse({
 *   v: 1, channel: 'price.crypto', seq: 5, ts: 1788886177000, payload: {},
 * });
 * ```
 */
export const PolymarketPriceEnvelopeSchemaObject: BaseGuardian<
  PolymarketPriceEnvelope
> = Guardian.object({
  v: Guardian.number().strict(),
  channel: Guardian.string(),
  seq: Guardian.number().strict(),
  ts: Guardian.number().strict(),
  snapshot: Guardian.boolean().strict().optional(),
  dropped: Guardian.number().strict().optional(),
  payload: Guardian.unknown(),
}).passthrough().describe({
  title: 'PolyBolt envelope',
  description: 'Delivery envelope around every PolyBolt payload.',
});
