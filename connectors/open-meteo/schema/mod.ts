/**
 * Guardian schemas behind `@tundraconnect/open-meteo`: the per-location
 * response every Open-Meteo weather API returns, and the error body. Use
 * them to validate a payload you stored elsewhere (a recorded response,
 * a cached file), or to type your own code against the client's shapes.
 *
 * @example
 * ```ts
 * import { OpenMeteoForecastSchemaObject } from '@tundraconnect/open-meteo/schemas';
 *
 * declare const body: unknown; // e.g. a recorded response
 * const [error, value] = OpenMeteoForecastSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value.hourly?.time.length);
 * ```
 *
 * @module
 */

export {
  type OpenMeteoCurrentBlockSchema,
  OpenMeteoCurrentBlockSchemaObject,
  type OpenMeteoForecastSchema,
  OpenMeteoForecastSchemaObject,
  type OpenMeteoSeriesBlockSchema,
  OpenMeteoSeriesBlockSchemaObject,
} from './Forecast.ts';

export {
  type OpenMeteoErrorBodySchema,
  OpenMeteoErrorBodySchemaObject,
} from './Error.ts';
