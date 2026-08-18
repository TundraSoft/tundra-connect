import { type BaseGuardian, Guardian } from '@guardian';
import {
  baseGuard,
  disclaimerGuard,
  endDateGuard,
  licenseGuard,
  startDateGuard,
} from './Common.ts';

/**
 * Schema for individual OHLC (Open, High, Low, Close) data points
 *
 * This schema validates the OHLC data structure for a single currency,
 * containing the open, high, low, close, and average values for a
 * specific time period.
 *
 * @example
 * ```typescript
 * const ohlcData = {
 *   open: 1.185,
 *   high: 1.192,
 *   low: 1.178,
 *   close: 1.189,
 *   average: 1.186
 * };
 *
 * const [error, validatedOHLC] = OHLCDataSchemaObject.safeParse(ohlcData);
 * if (!error) {
 *   console.log('Daily high:', validatedOHLC.high);
 *   console.log('Daily low:', validatedOHLC.low);
 * }
 * ```
 */
export type OHLCDataSchema = {
  /** Opening rate for the period */
  open: number;
  /** Highest rate during the period */
  high: number;
  /** Lowest rate during the period */
  low: number;
  /** Closing rate for the period */
  close: number;
  /** Average rate for the period */
  average: number;
};

/** Schema for individual OHLC data points (see {@link OHLCDataSchema}). */
export const OHLCDataSchemaObject: BaseGuardian<OHLCDataSchema> = Guardian
  .object({
    /** Opening rate for the period */
    open: Guardian.number().min(0),
    /** Highest rate during the period */
    high: Guardian.number().min(0),
    /** Lowest rate during the period */
    low: Guardian.number().min(0),
    /** Closing rate for the period */
    close: Guardian.number().min(0),
    /** Average rate for the period */
    average: Guardian.number().min(0),
  }).describe({
    title: 'OHLC data point',
    description: 'Open, high, low, close, and average rates for one currency.',
  });

/**
 * Schema for OpenExchange API OHLC response
 *
 * This schema validates the response from the /ohlc.json endpoint,
 * which returns OHLC (Open, High, Low, Close) data for currency pairs
 * over a specified time period. The data is organized by date and currency.
 *
 * @example
 * ```typescript
 * const ohlcResponse = {
 *   disclaimer: "Usage subject to terms...",
 *   license: "https://openexchangerates.org/license",
 *   start_date: "2023-01-01",
 *   end_date: "2023-01-03",
 *   base: "USD",
 *   rates: {
 *     "2023-01-01": {
 *       "EUR": {
 *         open: 0.883,
 *         high: 0.885,
 *         low: 0.881,
 *         close: 0.884,
 *         average: 0.883
 *       },
 *       "GBP": {
 *         open: 0.741,
 *         high: 0.743,
 *         low: 0.739,
 *         close: 0.741,
 *         average: 0.741
 *       }
 *     },
 *     "2023-01-02": {
 *       "EUR": {
 *         open: 0.884,
 *         high: 0.887,
 *         low: 0.882,
 *         close: 0.885,
 *         average: 0.884
 *       }
 *     }
 *   }
 * };
 *
 * const [error, validatedOHLC] = OHLCSchemaObject.safeParse(ohlcResponse);
 * if (!error) {
 *   console.log('EUR OHLC on 2023-01-01:', validatedOHLC.rates['2023-01-01'].EUR);
 * }
 * ```
 */
export type OHLCSchema = {
  /** Legal disclaimer text (optional) */
  disclaimer?: string;
  /** License information URL (optional) */
  license?: string;
  /** Start date of the OHLC data (YYYY-MM-DD format) */
  start_date: string;
  /** End date of the OHLC data (YYYY-MM-DD format) */
  end_date: string;
  /** Base currency code (optional) */
  base?: string;
  /** OHLC data organized by date and currency (date -> {currency -> OHLC}) */
  rates: Record<string, Record<string, OHLCDataSchema>>;
};

/** Schema for OpenExchange API OHLC response (see {@link OHLCSchema}). */
export const OHLCSchemaObject: BaseGuardian<OHLCSchema> = Guardian.object({
  /** Legal disclaimer text (optional) */
  disclaimer: disclaimerGuard.optional(),
  /** License information URL (optional) */
  license: licenseGuard.optional(),
  /** Start date of the OHLC data (YYYY-MM-DD format) */
  start_date: startDateGuard,
  /** End date of the OHLC data (YYYY-MM-DD format) */
  end_date: endDateGuard,
  /** Base currency code (optional) */
  base: baseGuard.optional(),
  /** OHLC data organized by date and currency (date -> {currency -> OHLC}) */
  rates: Guardian.record(
    Guardian.string(), // Date in YYYY-MM-DD format
    Guardian.record(
      Guardian.string(), // Currency code
      OHLCDataSchemaObject, // OHLC data for that currency
    ),
  ),
}).describe({
  title: 'OHLC response',
  description: 'OpenExchange OHLC rates grouped by date and currency.',
});
