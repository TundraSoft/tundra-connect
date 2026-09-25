/**
 * Guardian schemas behind `@tundraconnect/openexchange`: every request and
 * response shape the client validates, each exported as a schema object with
 * its inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { LatestRatesSchemaObject } from '@tundraconnect/openexchange/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = LatestRatesSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  type StatusSchema,
  StatusSchemaObject,
  type UsageResponseSchema,
  UsageResponseSchemaObject,
  type UsageSchema,
  UsageSchemaObject,
} from './Usage.ts';

export { type ErrorSchema, ErrorSchemaObject } from './Error.ts';

export {
  baseGuard,
  disclaimerGuard,
  endDateGuard,
  licenseGuard,
  type RateSchema,
  RateSchemaObject,
  startDateGuard,
  timestampGuard,
} from './Common.ts';

export { type CurrenciesSchema, CurrenciesSchemaObject } from './Currencies.ts';

export {
  type LatestRatesSchema,
  LatestRatesSchemaObject,
} from './LatestRates.ts';

export {
  type HistoricalRatesSchema,
  HistoricalRatesSchemaObject,
} from './HistoricalRates.ts';

export { type TimeSeriesSchema, TimeSeriesSchemaObject } from './TimeSeries.ts';

export {
  type ConvertRequestSchema,
  ConvertRequestSchemaObject,
} from './Convert.ts';

export {
  type OHLCDataSchema,
  OHLCDataSchemaObject,
  type OHLCSchema,
  OHLCSchemaObject,
} from './OHLC.ts';
