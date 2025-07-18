import { Guardian, type GuardianType } from '$guardian';
import {
  baseGuard,
  disclaimerGuard,
  licenseGuard,
  RateSchemaObject,
  timestampGuard,
} from './Common.ts';

/**
 * Schema for OpenExchange API latest rates response
 *
 * This schema validates the response from the /latest.json endpoint,
 * which returns the most recent exchange rates for all supported currencies.
 * The response includes metadata (timestamp, base currency, legal notices)
 * and the actual exchange rates.
 *
 * @example
 * ```typescript
 * const latestRatesData = {
 *   disclaimer: "Usage subject to terms...",
 *   license: "https://openexchangerates.org/license",
 *   timestamp: 1640995200,
 *   base: "USD",
 *   rates: {
 *     "EUR": 0.885,
 *     "GBP": 0.739,
 *     "JPY": 115.43,
 *     "CAD": 1.266
 *   }
 * };
 *
 * const [error, validatedRates] = LatestRatesSchemaObject.validate(latestRatesData);
 * if (!error) {
 *   console.log('EUR rate:', validatedRates.rates.EUR);
 *   console.log('Base currency:', validatedRates.base);
 * }
 * ```
 */
export const LatestRatesSchemaObject = Guardian.object().schema({
  /** Legal disclaimer text (optional) */
  disclaimer: disclaimerGuard.optional(),
  /** License information URL (optional) */
  license: licenseGuard.optional(),
  /** Unix timestamp when rates were last updated (optional) */
  timestamp: timestampGuard.optional(),
  /** Base currency code (optional, defaults to USD) */
  base: baseGuard.optional(),
  /** Exchange rates mapping (currency code -> rate) */
  rates: RateSchemaObject, // Main focus: currency rates
});

/** Type definition for OpenExchange API latest rates response */
export type LatestRatesSchema = GuardianType<typeof LatestRatesSchemaObject>;
