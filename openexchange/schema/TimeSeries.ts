import { Guardian, type GuardianType } from '$guardian';
import {
  baseGuard,
  disclaimerGuard,
  endDateGuard,
  licenseGuard,
  RateSchemaObject,
  startDateGuard,
} from './Common.ts';

/**
 * Schema for OpenExchange API time series response
 *
 * This schema validates the response from the /time-series.json endpoint,
 * which returns exchange rates for a range of dates. The response includes
 * metadata and rates organized by date, allowing for trend analysis and
 * historical comparisons.
 *
 * @example
 * ```typescript
 * const timeSeriesData = {
 *   disclaimer: "Usage subject to terms...",
 *   license: "https://openexchangerates.org/license",
 *   start_date: "2023-01-01",
 *   end_date: "2023-01-03",
 *   base: "USD",
 *   rates: {
 *     "2023-01-01": {
 *       "EUR": 0.883,
 *       "GBP": 0.741,
 *       "JPY": 115.01
 *     },
 *     "2023-01-02": {
 *       "EUR": 0.885,
 *       "GBP": 0.739,
 *       "JPY": 115.43
 *     },
 *     "2023-01-03": {
 *       "EUR": 0.884,
 *       "GBP": 0.740,
 *       "JPY": 115.22
 *     }
 *   }
 * };
 *
 * const [error, validatedSeries] = TimeSeriesSchemaObject.validate(timeSeriesData);
 * if (!error) {
 *   console.log('EUR rate on 2023-01-01:', validatedSeries.rates['2023-01-01'].EUR);
 *   console.log('Date range:', validatedSeries.start_date, 'to', validatedSeries.end_date);
 * }
 * ```
 */
export const TimeSeriesSchemaObject = Guardian.object().schema({
  /** Legal disclaimer text (optional) */
  disclaimer: disclaimerGuard.optional(),
  /** License information URL (optional) */
  license: licenseGuard.optional(),
  /** Start date of the time series (YYYY-MM-DD format) */
  start_date: startDateGuard,
  /** End date of the time series (YYYY-MM-DD format) */
  end_date: endDateGuard,
  /** Base currency code for all rates */
  base: baseGuard,
  /** Exchange rates organized by date (date -> {currency -> rate}) */
  rates: Guardian.object().keyValue(
    Guardian.string(), // Date in YYYY-MM-DD format
    RateSchemaObject, // Currency rates for that date
  ),
});

/** Type definition for OpenExchange API time series response */
export type TimeSeriesSchema = GuardianType<typeof TimeSeriesSchemaObject>;
