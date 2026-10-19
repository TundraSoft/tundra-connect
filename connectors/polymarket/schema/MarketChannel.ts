import { type BaseGuardian, Guardian } from '@guardian';
import { camelizeKeys } from './camelizeKeys.ts';

/**
 * CLOB market-channel WebSocket messages
 * (`wss://ws-subscriptions-clob.polymarket.com/ws/market`). Keys are
 * camelCased, decimal strings become numbers, millisecond timestamp
 * strings become numbers, and `.passthrough()` keeps every field the venue
 * adds beyond the documented ones (the initial `book` frame, for one,
 * also carries `tickSize` and `lastTradePrice`).
 */

const side = Guardian.enum(['BUY', 'SELL'] as const);

/** One price level: `size` shares resting at `price`. */
export type PolymarketBookLevel = { price: number; size: number };

const _level = Guardian.object({
  price: Guardian.number(),
  size: Guardian.number(),
}).passthrough();

// ── book ───────────────────────────────────────────────────────────────────

/**
 * A full order-book snapshot for one outcome token — sent on subscribe
 * and whenever the venue re-snapshots (after a trade, on reconnect).
 * Every level, at full depth.
 */
export type PolymarketBook = {
  eventType: 'book';
  /** Condition id. */
  market: string;
  /** Outcome token id. */
  assetId: string;
  /** Unix milliseconds. */
  timestamp: number;
  /** Order-book hash at this snapshot. */
  hash: string;
  bids: PolymarketBookLevel[];
  asks: PolymarketBookLevel[];
  /** Present on the initial snapshot. */
  tickSize?: number;
  /** Present on the initial snapshot. */
  lastTradePrice?: number;
};

/**
 * Schema for a `book` message.
 *
 * @example
 * ```typescript
 * import { PolymarketBookSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, book] = PolymarketBookSchemaObject.safeParse({
 *   event_type: 'book', market: '0xabc', asset_id: '1', timestamp: '1782753357257',
 *   hash: '0x1', bids: [{ price: '0.08', size: '33343.4' }], asks: [],
 * });
 * ```
 */
export const PolymarketBookSchemaObject: BaseGuardian<PolymarketBook> = Guardian
  .preprocess(
    camelizeKeys,
    Guardian.object({
      eventType: Guardian.literal('book'),
      market: Guardian.string(),
      assetId: Guardian.string(),
      timestamp: Guardian.number(),
      hash: Guardian.string(),
      bids: Guardian.array(_level),
      asks: Guardian.array(_level),
      tickSize: Guardian.number().optional(),
      lastTradePrice: Guardian.number().optional(),
    }).passthrough().describe({
      title: 'Market-channel book',
      description: 'A full order-book snapshot for one outcome token.',
    }),
  );

// ── price_change ───────────────────────────────────────────────────────────

/** One level change inside a `price_change` message. `size` is the NEW size at `price` (`0` removes the level). */
export type PolymarketPriceChangeEntry = {
  assetId: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  /** Order-book hash after this change. */
  hash: string;
  bestBid?: number;
  bestAsk?: number;
};

/** Book deltas: one or more level changes, possibly across both outcome tokens of a market. */
export type PolymarketPriceChange = {
  eventType: 'price_change';
  market: string;
  /** Unix milliseconds. */
  timestamp: number;
  priceChanges: PolymarketPriceChangeEntry[];
};

/**
 * Schema for a `price_change` message. Some server variants name the
 * array `changes`; it normalizes to `priceChanges`.
 *
 * @example
 * ```typescript
 * import { PolymarketPriceChangeSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, change] = PolymarketPriceChangeSchemaObject.safeParse({
 *   event_type: 'price_change', market: '0xabc', timestamp: '1782753357257',
 *   price_changes: [{ asset_id: '1', price: '0.08', size: '10', side: 'BUY', hash: 'h' }],
 * });
 * ```
 */
export const PolymarketPriceChangeSchemaObject: BaseGuardian<
  PolymarketPriceChange
> = Guardian.preprocess(
  (raw: unknown) => {
    const o = camelizeKeys(raw);
    if (typeof o !== 'object' || o === null) return o;
    const r = o as Record<string, unknown>;
    if (r.priceChanges === undefined && r.changes !== undefined) {
      const { changes, ...rest } = r;
      return { ...rest, priceChanges: changes };
    }
    return r;
  },
  Guardian.object({
    eventType: Guardian.literal('price_change'),
    market: Guardian.string(),
    timestamp: Guardian.number(),
    priceChanges: Guardian.array(
      Guardian.object({
        assetId: Guardian.string(),
        price: Guardian.number(),
        size: Guardian.number(),
        side,
        hash: Guardian.string(),
        bestBid: Guardian.number().optional(),
        bestAsk: Guardian.number().optional(),
      }).passthrough(),
    ),
  }).passthrough().describe({
    title: 'Market-channel price change',
    description: 'Order-book level changes (deltas) for a market.',
  }),
);

// ── tick_size_change ───────────────────────────────────────────────────────

/** The minimum tick moved (prices near 0 or 1 tighten it). */
export type PolymarketTickSizeChange = {
  eventType: 'tick_size_change';
  market: string;
  assetId: string;
  oldTickSize: number;
  newTickSize: number;
  /** Unix milliseconds. */
  timestamp: number;
};

/**
 * Schema for a `tick_size_change` message.
 *
 * @example
 * ```typescript
 * import { PolymarketTickSizeChangeSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, change] = PolymarketTickSizeChangeSchemaObject.safeParse({
 *   event_type: 'tick_size_change', market: '0xabc', asset_id: '1',
 *   old_tick_size: '0.01', new_tick_size: '0.001', timestamp: '1782753357257',
 * });
 * ```
 */
export const PolymarketTickSizeChangeSchemaObject: BaseGuardian<
  PolymarketTickSizeChange
> = Guardian.preprocess(
  camelizeKeys,
  Guardian.object({
    eventType: Guardian.literal('tick_size_change'),
    market: Guardian.string(),
    assetId: Guardian.string(),
    oldTickSize: Guardian.number(),
    newTickSize: Guardian.number(),
    timestamp: Guardian.number(),
  }).passthrough().describe({
    title: 'Market-channel tick size change',
    description: 'The minimum price increment of an outcome token changed.',
  }),
);

// ── last_trade_price ───────────────────────────────────────────────────────

/** One trade print. */
export type PolymarketLastTradePrice = {
  eventType: 'last_trade_price';
  market: string;
  assetId: string;
  price: number;
  size: number;
  /** Taker side. */
  side: 'BUY' | 'SELL';
  feeRateBps?: number;
  /** Unix milliseconds. */
  timestamp: number;
  transactionHash?: string;
};

/**
 * Schema for a `last_trade_price` message.
 *
 * @example
 * ```typescript
 * import { PolymarketLastTradePriceSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, trade] = PolymarketLastTradePriceSchemaObject.safeParse({
 *   event_type: 'last_trade_price', market: '0xabc', asset_id: '1', price: '0.08',
 *   size: '219.2', fee_rate_bps: '0', side: 'SELL', timestamp: '1782753357257',
 * });
 * ```
 */
export const PolymarketLastTradePriceSchemaObject: BaseGuardian<
  PolymarketLastTradePrice
> = Guardian.preprocess(
  camelizeKeys,
  Guardian.object({
    eventType: Guardian.literal('last_trade_price'),
    market: Guardian.string(),
    assetId: Guardian.string(),
    price: Guardian.number(),
    size: Guardian.number(),
    side,
    feeRateBps: Guardian.number().optional(),
    timestamp: Guardian.number(),
    transactionHash: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Market-channel last trade price',
    description: 'One trade print on an outcome token.',
  }),
);

// ── best_bid_ask ───────────────────────────────────────────────────────────

/** Top-of-book change (requires `custom_feature_enabled`, which the socket sets). */
export type PolymarketBestBidAsk = {
  eventType: 'best_bid_ask';
  market: string;
  assetId: string;
  bestBid: number;
  bestAsk: number;
  spread: number;
  /** Unix milliseconds. */
  timestamp: number;
};

/**
 * Schema for a `best_bid_ask` message.
 *
 * @example
 * ```typescript
 * import { PolymarketBestBidAskSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, top] = PolymarketBestBidAskSchemaObject.safeParse({
 *   event_type: 'best_bid_ask', market: '0xabc', asset_id: '1', best_bid: '0.08',
 *   best_ask: '0.09', spread: '0.01', timestamp: '1782753357257',
 * });
 * ```
 */
export const PolymarketBestBidAskSchemaObject: BaseGuardian<
  PolymarketBestBidAsk
> = Guardian.preprocess(
  camelizeKeys,
  Guardian.object({
    eventType: Guardian.literal('best_bid_ask'),
    market: Guardian.string(),
    assetId: Guardian.string(),
    bestBid: Guardian.number(),
    bestAsk: Guardian.number(),
    spread: Guardian.number(),
    timestamp: Guardian.number(),
  }).passthrough().describe({
    title: 'Market-channel best bid/ask',
    description: 'Top-of-book change for an outcome token.',
  }),
);

// ── new_market / market_resolved ───────────────────────────────────────────

/** A market was listed (broadcast to every custom-feature subscriber, not only subscribed tokens). */
export type PolymarketNewMarket = {
  eventType: 'new_market';
  /** Gamma market id. */
  id: string;
  question: string;
  /** Condition id. */
  market: string;
  slug: string;
  assetsIds: string[];
  outcomes: string[];
  /** Unix milliseconds. */
  timestamp: number;
};

/**
 * Schema for a `new_market` message. The live feed carries many more
 * fields (`description`, `tags`, fee schedule, ...); they pass through.
 *
 * @example
 * ```typescript
 * import { PolymarketNewMarketSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, listed] = PolymarketNewMarketSchemaObject.safeParse({
 *   event_type: 'new_market', id: '1', question: 'Q?', market: '0xabc', slug: 'q',
 *   assets_ids: ['1', '2'], outcomes: ['Yes', 'No'], timestamp: '1782753357257',
 * });
 * ```
 */
export const PolymarketNewMarketSchemaObject: BaseGuardian<
  PolymarketNewMarket
> = Guardian.preprocess(
  camelizeKeys,
  Guardian.object({
    eventType: Guardian.literal('new_market'),
    id: Guardian.string(),
    question: Guardian.string(),
    market: Guardian.string(),
    slug: Guardian.string(),
    assetsIds: Guardian.array(Guardian.string()),
    outcomes: Guardian.array(Guardian.string()),
    timestamp: Guardian.number(),
  }).passthrough().describe({
    title: 'Market-channel new market',
    description: 'A newly listed market.',
  }),
);

/** A market resolved. */
export type PolymarketMarketResolved = {
  eventType: 'market_resolved';
  id: string;
  market: string;
  assetsIds: string[];
  winningAssetId: string;
  winningOutcome: string;
  /** Unix milliseconds. */
  timestamp: number;
};

/**
 * Schema for a `market_resolved` message.
 *
 * @example
 * ```typescript
 * import { PolymarketMarketResolvedSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, resolved] = PolymarketMarketResolvedSchemaObject.safeParse({
 *   event_type: 'market_resolved', id: '1', market: '0xabc', assets_ids: ['1', '2'],
 *   winning_asset_id: '1', winning_outcome: 'Yes', timestamp: '1782753357257',
 * });
 * ```
 */
export const PolymarketMarketResolvedSchemaObject: BaseGuardian<
  PolymarketMarketResolved
> = Guardian.preprocess(
  camelizeKeys,
  Guardian.object({
    eventType: Guardian.literal('market_resolved'),
    id: Guardian.string(),
    market: Guardian.string(),
    assetsIds: Guardian.array(Guardian.string()),
    winningAssetId: Guardian.string(),
    winningOutcome: Guardian.string(),
    timestamp: Guardian.number(),
  }).passthrough().describe({
    title: 'Market-channel market resolved',
    description: 'A market resolved, naming the winning outcome token.',
  }),
);
