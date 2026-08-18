import { type BaseGuardian, Guardian } from '@guardian';
import { coinIdGuard, coinNameGuard, coinSymbolGuard } from './Common.ts';

/** Type definition for a single `/coins/list` entry. */
export interface CoinListEntrySchema {
  /** Vendor coin id, used as the `ids` parameter elsewhere. */
  id: string;
  /** Ticker symbol. */
  symbol: string;
  /** Display name. */
  name: string;
  /** Contract address by platform slug, present when `include_platform` is requested. */
  platforms?: Record<string, string>;
}

/**
 * Schema for a single entry in the CoinGecko `/coins/list` response
 *
 * @example
 * ```typescript
 * import { CoinListEntrySchemaObject } from '@tundraconnect/coingecko/schemas';
 *
 * const [error, coin] = CoinListEntrySchemaObject.safeParse({
 *   id: 'bitcoin',
 *   symbol: 'btc',
 *   name: 'Bitcoin',
 * });
 * ```
 */
export const CoinListEntrySchemaObject: BaseGuardian<CoinListEntrySchema> =
  Guardian.object({
    /** Vendor coin id, used as the `ids` parameter elsewhere. */
    id: coinIdGuard,
    /** Ticker symbol. */
    symbol: coinSymbolGuard,
    /** Display name. */
    name: coinNameGuard,
    /** Contract address by platform slug, present when `include_platform` is requested. */
    platforms: Guardian.record(Guardian.string(), Guardian.string())
      .optional(),
  }).describe({
    title: 'Coin list entry',
    description: 'A single coin as returned by /coins/list.',
  });

/** Type definition for the CoinGecko `/coins/list` response. */
export type CoinListSchema = CoinListEntrySchema[];

/**
 * Schema for the full CoinGecko `/coins/list` response — a flat array of
 * {@link CoinListEntrySchemaObject} entries.
 *
 * @example
 * ```typescript
 * import { CoinListSchemaObject } from '@tundraconnect/coingecko/schemas';
 *
 * const [error, coins] = CoinListSchemaObject.safeParse([
 *   { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
 * ]);
 * ```
 */
export const CoinListSchemaObject: BaseGuardian<CoinListSchema> = Guardian
  .array(CoinListEntrySchemaObject)
  .describe({
    title: 'Coin list response',
    description: 'Every coin supported by CoinGecko.',
  });
