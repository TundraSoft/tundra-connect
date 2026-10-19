import { type BaseGuardian, Guardian } from '@guardian';
import { camelizeKeys } from './camelizeKeys.ts';

/**
 * Real-time reference-price messages: the legacy real-time data socket
 * (`wss://ws-live-data.polymarket.com` — Chainlink and Binance crypto
 * prices) and its replacement, PolyBolt (`wss://ws-live-v2.polymarket.com/ws`
 * — Chainlink/Pyth crypto, equity, TWAP and Polymarket top-of-book
 * channels). Keys are camelCased and every unmodelled field passes
 * through; `fullAccuracyValue` stays a string because it is the exact
 * decimal (or, on the legacy Chainlink topic, an E18 integer) the source
 * published.
 */

// ── Legacy real-time data socket ───────────────────────────────────────────

/** One price update from the legacy real-time data socket. */
export type PolymarketLiveDataPrice = {
  /** `crypto_prices_chainlink` or `crypto_prices` (Binance). */
  topic: string;
  /** `update` for live prices. */
  type: string;
  /** Server send time, Unix milliseconds. */
  timestamp: number;
  connectionId?: string;
  payload: {
    /** Wire symbol: `btc/usd` (Chainlink) or `btcusdt` (Binance). */
    symbol: string;
    /** Source event time, Unix milliseconds. */
    timestamp: number;
    value: number;
    /** Exact published value: an E18 integer string on Chainlink, a decimal on Binance. */
    fullAccuracyValue?: string;
  };
};

/**
 * Schema for a legacy real-time data socket price message.
 *
 * @example
 * ```typescript
 * import { PolymarketLiveDataPriceSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, price] = PolymarketLiveDataPriceSchemaObject.safeParse({
 *   topic: 'crypto_prices', type: 'update', timestamp: 1792414378173,
 *   payload: { symbol: 'xrpusdt', timestamp: 1792414378000, value: 1.3098, full_accuracy_value: '1.30980000' },
 * });
 * ```
 */
export const PolymarketLiveDataPriceSchemaObject: BaseGuardian<
  PolymarketLiveDataPrice
> = Guardian.preprocess(
  camelizeKeys,
  Guardian.object({
    topic: Guardian.string(),
    type: Guardian.string(),
    timestamp: Guardian.number(),
    connectionId: Guardian.string().optional(),
    payload: Guardian.object({
      symbol: Guardian.string(),
      timestamp: Guardian.number(),
      value: Guardian.number(),
      fullAccuracyValue: Guardian.string().optional(),
    }).passthrough(),
  }).passthrough().describe({
    title: 'Live-data price',
    description:
      'A Chainlink or Binance crypto price from the legacy real-time data socket.',
  }),
);

// ── PolyBolt ───────────────────────────────────────────────────────────────

/** One historical point inside a PolyBolt snapshot batch (no symbol/source — those are on the batch). */
export type PolymarketPricePoint = {
  value: number;
  fullAccuracyValue: string;
  /** Source event time, Unix milliseconds. */
  timestamp: number;
};

/**
 * A live PolyBolt price — `price.crypto`, `price.equity`, or their
 * `.twap` channels.
 */
export type PolymarketPriceUpdate = {
  symbol: string;
  value: number;
  /** Exact decimal as published — prefer it over `value`. */
  fullAccuracyValue: string;
  /** Source event time, Unix milliseconds. */
  timestamp: number;
  /** `chainlink` | `pyth` | `massive`. */
  source: string;
  /** TWAP channels only. */
  windowSeconds?: number;
  /** Equity only: ingest receive time, Unix milliseconds. */
  receivedAt?: number;
  /** Equity only: carried forward from the last session (market closed). */
  isCarriedForward?: boolean;
};

/** The snapshot sent once per new PolyBolt subscription: up to two minutes of history. */
export type PolymarketPriceSnapshot = {
  symbol: string;
  source: string;
  windowSeconds?: number;
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
    description: 'A live crypto, equity or TWAP reference price.',
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
