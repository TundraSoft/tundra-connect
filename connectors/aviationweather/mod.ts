/**
 * Typed, cross-runtime client for the [aviationweather.gov Data
 * API](https://aviationweather.gov/data/api/): METAR and SPECI
 * observations, TAFs and the bulk METAR cache — raw report text alongside
 * the decoded fields, plus the remarks T-group's tenths-of-a-degree
 * temperatures that temperature markets settle on.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`AviationWeatherError` and its code registry).
 *
 * @example
 * ```ts
 * import { AviationWeather } from '@tundraconnect/aviationweather';
 *
 * const awc = new AviationWeather();
 * const reports = await awc.getMetars({ ids: 'KNYC', hours: 6 });
 * for (const r of reports) {
 *   console.log(r.rawOb, r.remarkTemperatures.hourly?.temperatureC);
 * }
 * ```
 *
 * @module
 */

export {
  AviationWeather,
  AVIATIONWEATHER_RATE_LIMIT,
  type AviationWeatherBoundingBox,
  type AviationWeatherMetar,
  type AviationWeatherMetarCache,
  type AviationWeatherMetarCacheRow,
  type AviationWeatherMetarQuery,
  type AviationWeatherOptions,
  type AviationWeatherRateLimit,
  type AviationWeatherTafQuery,
} from './AviationWeather.ts';

export {
  type MetarRemarkGroup,
  type MetarRemarkTemperatures,
  parseRemarkTemperatures,
} from './remarks.ts';

export * from './errors/mod.ts';

export * from './schema/mod.ts';
