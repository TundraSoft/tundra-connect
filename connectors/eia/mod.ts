/**
 * Typed, cross-runtime client for the [U.S. EIA Open Data API
 * v2](https://www.eia.gov/opendata/): any route and facet, pagination past
 * the 5,000-row cap, and helpers for WTI/Brent spot prices and Weekly
 * Petroleum Status Report stocks. Rows keep EIA's own values and periods;
 * pages keep their metadata, because EIA revises data.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`EIAError` and its code registry).
 *
 * @example
 * ```ts
 * import { EIA } from '@tundraconnect/eia';
 *
 * const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });
 * const { rows } = await eia.getWeeklyStocks({ start: '2026-10-01' });
 * console.log(rows.map((r) => [r.period, r.series, r.value]));
 * ```
 *
 * @module
 */

export {
  EIA,
  EIA_MAX_PAGE_SIZE,
  EIA_SPOT_SERIES,
  EIA_WPSR_STOCK_SERIES,
  type EIAAllData,
  type EIAAuth,
  type EIADataQuery,
  type EIAOptions,
  type EIAPage,
  type EIAPageInfo,
  type EIAPaginateOptions,
  type EIASort,
  type EIASpotPriceQuery,
  type EIAWeeklyStocksQuery,
} from './EIA.ts';

export * from './errors/mod.ts';

export * from './schema/mod.ts';
