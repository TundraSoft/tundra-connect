/**
 * @module @tundraconnect/openweathermap
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
