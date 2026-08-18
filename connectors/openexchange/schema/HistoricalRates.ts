import { type BaseGuardian, Guardian } from '@guardian';
import {
  baseGuard,
  disclaimerGuard,
  licenseGuard,
  type RateSchema,
  RateSchemaObject,
  timestampGuard,
} from './Common.ts';

/**
 * Schema for OpenExchange API historical rates response
 *
 * This schema validates the response from the /historical/{date}.json endpoint,
 * which returns exchange rates for a specific date in the past. The response
 * shape is identical to `/latest.json` — the vendor does not echo back a
 * `historical` flag anywhere in the payload.
 *
 * @example
 * ```typescript
 * const historicalRatesData = {
 *   disclaimer: "Usage subject to terms...",
 *   license: "https://openexchangerates.org/license",
 *   timestamp: 1640995200,
 *   base: "USD",
 *   rates: {
 *     "EUR": 0.883,
 *     "GBP": 0.741,
 *     "JPY": 115.01,
 *     "CAD": 1.264
 *   }
 * };
 *
 * const [error, validatedRates] = HistoricalRatesSchemaObject.safeParse(historicalRatesData);
 * if (!error) {
 *   console.log('Historical EUR rate:', validatedRates.rates.EUR);
 *   console.log('Timestamp:', validatedRates.timestamp);
 * }
 * ```
 */
export type HistoricalRatesSchema = {
  /** Legal disclaimer text (optional) */
  disclaimer?: string;
  /** License information URL (optional) */
  license?: string;
  /** Unix timestamp for the specific historical date (required) */
  timestamp: number;
  /** Base currency code (optional, defaults to USD) */
  base?: string;
  /** Exchange rates mapping for the historical date */
  rates: RateSchema;
};

/** Schema for OpenExchange API historical rates response (see {@link HistoricalRatesSchema}). */
export const HistoricalRatesSchemaObject: BaseGuardian<
  HistoricalRatesSchema
> = Guardian.object({
  /** Legal disclaimer text (optional) */
  disclaimer: disclaimerGuard.optional(),
  /** License information URL (optional) */
  license: licenseGuard.optional(),
  /** Unix timestamp for the specific historical date (required) */
  timestamp: timestampGuard, // Required field
  /** Base currency code (optional, defaults to USD) */
  base: baseGuard.optional(),
  /** Exchange rates mapping for the historical date */
  rates: RateSchemaObject, // Main focus: currency rates
}).describe({
  title: 'Historical rates response',
  description: 'Rates for a historical OpenExchange date.',
});
