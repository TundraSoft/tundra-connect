import { Guardian, type GuardianType } from '$guardian';
import {
  baseGuard,
  disclaimerGuard,
  historicalGuard,
  licenseGuard,
  RateSchemaObject,
  timestampGuard,
} from './Common.ts';

/**
 * Schema for OpenExchange API historical rates response
 *
 * This schema validates the response from the /historical/{date}.json endpoint,
 * which returns exchange rates for a specific date in the past. The response
 * includes metadata and a historical flag that must be true to distinguish
 * from latest rates.
 *
 * @example
 * ```typescript
 * const historicalRatesData = {
 *   disclaimer: "Usage subject to terms...",
 *   license: "https://openexchangerates.org/license",
 *   timestamp: 1640995200,
 *   historical: true,
 *   base: "USD",
 *   rates: {
 *     "EUR": 0.883,
 *     "GBP": 0.741,
 *     "JPY": 115.01,
 *     "CAD": 1.264
 *   }
 * };
 *
 * const [error, validatedRates] = HistoricalRatesSchemaObject.validate(historicalRatesData);
 * if (!error) {
 *   console.log('Historical EUR rate:', validatedRates.rates.EUR);
 *   console.log('Is historical:', validatedRates.historical);
 * }
 * ```
 */
export const HistoricalRatesSchemaObject = Guardian.object().schema({
  /** Legal disclaimer text (optional) */
  disclaimer: disclaimerGuard.optional(),
  /** License information URL (optional) */
  license: licenseGuard.optional(),
  /** Unix timestamp for the specific historical date (required) */
  timestamp: timestampGuard, // Required field
  /** Flag indicating this is historical data (required, must be true) */
  historical: historicalGuard.equals(true), // Required field that must be true
  /** Base currency code (optional, defaults to USD) */
  base: baseGuard.optional(),
  /** Exchange rates mapping for the historical date */
  rates: RateSchemaObject, // Main focus: currency rates
});

/** Type definition for OpenExchange API historical rates response */
export type HistoricalRatesSchema = GuardianType<
  typeof HistoricalRatesSchemaObject
>;
