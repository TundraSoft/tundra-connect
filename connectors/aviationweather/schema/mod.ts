/**
 * Guardian schemas behind `@tundraconnect/aviationweather`: decoded METARs
 * and TAFs as the Data API returns them, and its error body. Use them to
 * validate a payload you stored elsewhere, or to type your own code.
 *
 * @example
 * ```ts
 * import { AviationWeatherMetarSchemaObject } from '@tundraconnect/aviationweather/schemas';
 *
 * declare const body: unknown; // e.g. a recorded response row
 * const [error, value] = AviationWeatherMetarSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value.rawOb);
 * ```
 *
 * @module
 */

export {
  type AviationWeatherCloudLayerSchema,
  AviationWeatherCloudLayerSchemaObject,
  type AviationWeatherMetarSchema,
  AviationWeatherMetarSchemaObject,
} from './Metar.ts';

export {
  type AviationWeatherTafPeriodSchema,
  AviationWeatherTafPeriodSchemaObject,
  type AviationWeatherTafSchema,
  AviationWeatherTafSchemaObject,
} from './Taf.ts';

export {
  type AviationWeatherErrorBodySchema,
  AviationWeatherErrorBodySchemaObject,
} from './Error.ts';
