import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for the CoinGecko `/simple/price` response. */
export type PriceSchema = Record<string, Record<string, number>>;

/**
 * Schema for the CoinGecko `/simple/price` response
 *
 * The response is an object keyed by coin id, each value an object keyed by
 * currency code (plus optional `_market_cap`, `_24h_vol`, `_24h_change`, and
 * `last_updated_at` fields depending on the request's `include_*` flags).
 *
 * An unknown coin id is not an error — CoinGecko returns HTTP 200 with an
 * empty object `{}` (this schema accepts that: an empty record is valid).
 *
 * @example
 * ```typescript
 * import { PriceSchemaObject } from '@tundraconnect/coingecko/schemas';
 *
 * const [error, prices] = PriceSchemaObject.safeParse({
 *   bitcoin: { usd: 65000.5, usd_market_cap: 1_280_000_000_000 },
 * });
 * if (!error) {
 *   console.log(prices.bitcoin?.usd);
 * }
 * ```
 */
export const PriceSchemaObject: BaseGuardian<PriceSchema> = Guardian.record(
  Guardian.string(), // Coin id
  Guardian.record(
    Guardian.string(), // Currency code (or `_market_cap` / `_24h_vol` / `_24h_change` / `last_updated_at` suffix)
    Guardian.number(),
  ),
).describe({
  title: 'Simple price response',
  description:
    'CoinGecko prices keyed by coin id, then by currency code. An unknown ' +
    'coin id yields an empty object rather than an error.',
});
