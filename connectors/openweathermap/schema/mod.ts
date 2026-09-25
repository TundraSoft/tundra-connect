/**
 * Guardian schemas behind `@tundraconnect/openweathermap`: every request and
 * response shape the client validates, each exported as a schema object with
 * its inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { CurrentWeatherSchemaObject } from '@tundraconnect/openweathermap/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = CurrentWeatherSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  type CloudsSchema,
  CloudsSchemaObject,
  codGuard,
  type CodSchema,
  type CoordSchema,
  CoordSchemaObject,
  type WeatherConditionSchema,
  WeatherConditionSchemaObject,
  type WindSchema,
  WindSchemaObject,
} from './Common.ts';

export {
  type CurrentWeatherSchema,
  CurrentWeatherSchemaObject,
} from './CurrentWeather.ts';

export { type ErrorSchema, ErrorSchemaObject } from './Error.ts';

export {
  type ForecastListItemSchema,
  ForecastListItemSchemaObject,
  type ForecastSchema,
  ForecastSchemaObject,
} from './Forecast.ts';
