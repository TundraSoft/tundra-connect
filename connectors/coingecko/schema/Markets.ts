import { type BaseGuardian, Guardian } from '@guardian';
import {
  coinIdGuard,
  coinNameGuard,
  coinSymbolGuard,
  type RoiSchema,
  RoiSchemaObject,
} from './Common.ts';

/** Type definition for a single `/coins/markets` entry. */
export interface MarketDataSchema {
  /** Vendor coin id. */
  id: string;
  /** Ticker symbol. */
  symbol: string;
  /** Display name. */
  name: string;
  /** Coin logo URL. */
  image?: string;
  /** Current price in the requested `vs_currency`. */
  current_price: number;
  /** Total market capitalization. */
  market_cap: number;
  /** Market cap rank; `null` when unranked. */
  market_cap_rank: number | null;
  /** 24h trading volume. */
  total_volume: number;
  /** 24h high; `null` when unavailable. */
  high_24h: number | null;
  /** 24h low; `null` when unavailable. */
  low_24h: number | null;
  /** Absolute 24h price change; `null` when unavailable. */
  price_change_24h: number | null;
  /** 24h price change percentage; `null` when unavailable. */
  price_change_percentage_24h: number | null;
  /** Circulating supply; `null` when unavailable. */
  circulating_supply: number | null;
  /** Total supply; `null` when unavailable/uncapped. */
  total_supply: number | null;
  /** Maximum possible supply; `null` when uncapped/unavailable. */
  max_supply: number | null;
  /** All-time-high price. */
  ath: number;
  /** ISO-8601 timestamp of the all-time high. */
  ath_date: string;
  /** All-time-low price. */
  atl: number;
  /** ISO-8601 timestamp of the all-time low. */
  atl_date: string;
  /** Return-on-investment summary; `null` when not applicable. */
  roi: RoiSchema | null;
  /** ISO-8601 timestamp of the last price update. */
  last_updated: string | null;
}

/**
 * Schema for a single entry in the CoinGecko `/coins/markets` response
 *
 * Several numeric fields are modeled as nullable — CoinGecko returns `null`
 * (rather than omitting the field) for thin/illiquid markets where it has
 * no data (e.g. `market_cap_rank`, `total_supply`, `max_supply`).
 *
 * @example
 * ```typescript
 * import { MarketDataSchemaObject } from '@tundraconnect/coingecko/schemas';
 *
 * const [error, market] = MarketDataSchemaObject.safeParse({
 *   id: 'bitcoin',
 *   symbol: 'btc',
 *   name: 'Bitcoin',
 *   image: 'https://example.com/bitcoin.png',
 *   current_price: 65000.5,
 *   market_cap: 1_280_000_000_000,
 *   market_cap_rank: 1,
 *   total_volume: 25_000_000_000,
 *   high_24h: 66000,
 *   low_24h: 64000,
 *   price_change_24h: 500,
 *   price_change_percentage_24h: 0.77,
 *   circulating_supply: 19_700_000,
 *   total_supply: 21_000_000,
 *   max_supply: 21_000_000,
 *   ath: 73750,
 *   ath_date: '2024-03-14T07:10:36.635Z',
 *   atl: 67.81,
 *   atl_date: '2013-07-06T00:00:00.000Z',
 *   roi: null,
 *   last_updated: '2024-06-01T00:00:00.000Z',
 * });
 * ```
 */
export const MarketDataSchemaObject: BaseGuardian<MarketDataSchema> = Guardian
  .object({
    /** Vendor coin id. */
    id: coinIdGuard,
    /** Ticker symbol. */
    symbol: coinSymbolGuard,
    /** Display name. */
    name: coinNameGuard,
    /** Coin logo URL. */
    image: Guardian.string().optional(),
    /** Current price in the requested `vs_currency`. */
    current_price: Guardian.number().min(0),
    /** Total market capitalization. */
    market_cap: Guardian.number().min(0),
    /** Market cap rank; `null` when unranked. */
    market_cap_rank: Guardian.number().integer().positive().nullable(),
    /** 24h trading volume. */
    total_volume: Guardian.number().min(0),
    /** 24h high; `null` when unavailable. */
    high_24h: Guardian.number().nullable(),
    /** 24h low; `null` when unavailable. */
    low_24h: Guardian.number().nullable(),
    /** Absolute 24h price change; `null` when unavailable. */
    price_change_24h: Guardian.number().nullable(),
    /** 24h price change percentage; `null` when unavailable. */
    price_change_percentage_24h: Guardian.number().nullable(),
    /** Circulating supply; `null` when unavailable. */
    circulating_supply: Guardian.number().min(0).nullable(),
    /** Total supply; `null` when unavailable/uncapped. */
    total_supply: Guardian.number().min(0).nullable(),
    /** Maximum possible supply; `null` when uncapped/unavailable. */
    max_supply: Guardian.number().min(0).nullable(),
    /** All-time-high price. */
    ath: Guardian.number().min(0),
    /** ISO-8601 timestamp of the all-time high. */
    ath_date: Guardian.string(),
    /** All-time-low price. */
    atl: Guardian.number().min(0),
    /** ISO-8601 timestamp of the all-time low. */
    atl_date: Guardian.string(),
    /** Return-on-investment summary; `null` when not applicable. */
    roi: RoiSchemaObject.nullable(),
    /** ISO-8601 timestamp of the last price update. */
    last_updated: Guardian.string().nullable(),
  }).describe({
    title: 'Market data entry',
    description: 'A single coin market snapshot as returned by /coins/markets.',
  });

/** Type definition for the CoinGecko `/coins/markets` response. */
export type MarketsSchema = MarketDataSchema[];

/**
 * Schema for the full CoinGecko `/coins/markets` response — an array of
 * {@link MarketDataSchemaObject} entries.
 *
 * @example
 * ```typescript
 * import { MarketsSchemaObject } from '@tundraconnect/coingecko/schemas';
 *
 * const [error, markets] = MarketsSchemaObject.safeParse([]);
 * ```
 */
export const MarketsSchemaObject: BaseGuardian<MarketsSchema> = Guardian
  .array(MarketDataSchemaObject)
  .describe({
    title: 'Markets response',
    description: 'A page of coin market snapshots.',
  });
