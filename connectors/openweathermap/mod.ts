/**
 * Typed, cross-runtime client for the [OpenWeatherMap
 * API](https://openweathermap.org/).
 *
 * Typed OpenWeatherMap client: current weather and 5-day / 3-hour forecasts by
 * city name or coordinates.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`OpenWeatherMapError` and its code registry).
 *
 * @example
 * ```ts
 * import { OpenWeatherMap } from '@tundraconnect/openweathermap';
 *
 * const client = new OpenWeatherMap({
 *   auth: { type: 'CUSTOM', apiKey: 'your-api-key' },
 * });
 *
 * const weather = await client.getCurrentWeather({
 *   lat: 51.51,
 *   lon: -0.13,
 *   units: 'metric',
 * });
 * console.log(weather.main.temp);
 *
 * const forecast = await client.getForecast({ q: 'London,GB', cnt: 8 });
 * console.log(forecast.list[0]?.main.temp);
 * ```
 *
 * @module
 */

// Export main client class
export {
  type CurrentWeatherOptions,
  type ForecastOptions,
  OpenWeatherMap,
  type OpenWeatherMapAuth,
  type OpenWeatherMapLocation,
  type OpenWeatherMapOptions,
  type OpenWeatherMapUnits,
} from './OpenWeatherMap.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
