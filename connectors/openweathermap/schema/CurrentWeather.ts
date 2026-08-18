import { type BaseGuardian, Guardian } from '@guardian';
import {
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

/**
 * Schema for the OpenWeatherMap current weather response
 *
 * This schema validates the response from the `/weather` endpoint, which
 * returns the current weather conditions for a single location.
 *
 * @example
 * ```typescript
 * const currentWeatherData = {
 *   coord: { lon: -0.13, lat: 51.51 },
 *   weather: [{ id: 800, main: 'Clear', description: 'clear sky', icon: '01d' }],
 *   base: 'stations',
 *   main: {
 *     temp: 15.2,
 *     feels_like: 14.6,
 *     temp_min: 13.9,
 *     temp_max: 16.1,
 *     pressure: 1015,
 *     humidity: 72,
 *   },
 *   visibility: 10000,
 *   wind: { speed: 4.1, deg: 280 },
 *   clouds: { all: 0 },
 *   dt: 1700000000,
 *   sys: { type: 2, id: 2019646, country: 'GB', sunrise: 1699945200, sunset: 1699977600 },
 *   timezone: 0,
 *   id: 2643743,
 *   name: 'London',
 *   cod: 200,
 * };
 *
 * const [error, validated] = CurrentWeatherSchemaObject.safeParse(currentWeatherData);
 * if (!error) {
 *   console.log('Temperature:', validated.main.temp);
 * }
 * ```
 */
export type CurrentWeatherSchema = {
  /** Geographic coordinates of the location */
  coord: CoordSchema;
  /** Weather condition entries (typically one) */
  weather: WeatherConditionSchema[];
  /** Internal parameter identifying the data source */
  base: string;
  /** Main weather measurements */
  main: {
    /** Temperature */
    temp: number;
    /** Human perceived temperature */
    feels_like: number;
    /** Minimum observed temperature */
    temp_min: number;
    /** Maximum observed temperature */
    temp_max: number;
    /** Atmospheric pressure at sea level, hPa */
    pressure: number;
    /** Humidity percentage */
    humidity: number;
    /** Atmospheric pressure at sea level, hPa (optional) */
    sea_level?: number;
    /** Atmospheric pressure at ground level, hPa (optional) */
    grnd_level?: number;
  };
  /** Visibility in meters */
  visibility: number;
  /** Wind data */
  wind: WindSchema;
  /** Rain volume (optional) */
  rain?: {
    /** Rain volume for the last hour, mm (optional) */
    '1h'?: number;
  };
  /** Snow volume (optional) */
  snow?: {
    /** Snow volume for the last hour, mm (optional) */
    '1h'?: number;
  };
  /** Cloudiness data */
  clouds: CloudsSchema;
  /** Unix timestamp of the data calculation */
  dt: number;
  /** System-level metadata */
  sys: {
    /** Internal parameter (optional) */
    type?: number;
    /** Internal parameter (optional) */
    id?: number;
    /** ISO 3166 country code (optional) */
    country?: string;
    /** Unix sunrise time */
    sunrise: number;
    /** Unix sunset time */
    sunset: number;
  };
  /** Shift in seconds from UTC */
  timezone: number;
  /** City ID */
  id: number;
  /** City name */
  name: string;
  /** Response code, echoed by the vendor */
  cod: CodSchema;
};

/** Schema for the OpenWeatherMap current weather response (see {@link CurrentWeatherSchema}). */
export const CurrentWeatherSchemaObject: BaseGuardian<CurrentWeatherSchema> =
  Guardian.object({
    /** Geographic coordinates of the location */
    coord: CoordSchemaObject,
    /** Weather condition entries (typically one) */
    weather: Guardian.array(WeatherConditionSchemaObject).minLength(1),
    /** Internal parameter identifying the data source */
    base: Guardian.string(),
    /** Main weather measurements */
    main: Guardian.object({
      /** Temperature */
      temp: Guardian.number(),
      /** Human perceived temperature */
      feels_like: Guardian.number(),
      /** Minimum observed temperature */
      temp_min: Guardian.number(),
      /** Maximum observed temperature */
      temp_max: Guardian.number(),
      /** Atmospheric pressure at sea level, hPa */
      pressure: Guardian.number(),
      /** Humidity percentage */
      humidity: Guardian.number(),
      /** Atmospheric pressure at sea level, hPa (optional) */
      sea_level: Guardian.number().optional(),
      /** Atmospheric pressure at ground level, hPa (optional) */
      grnd_level: Guardian.number().optional(),
    }),
    /** Visibility in meters */
    visibility: Guardian.number(),
    /** Wind data */
    wind: WindSchemaObject,
    /** Rain volume (optional) */
    rain: Guardian.object({
      /** Rain volume for the last hour, mm (optional) */
      '1h': Guardian.number().optional(),
    }).optional(),
    /** Snow volume (optional) */
    snow: Guardian.object({
      /** Snow volume for the last hour, mm (optional) */
      '1h': Guardian.number().optional(),
    }).optional(),
    /** Cloudiness data */
    clouds: CloudsSchemaObject,
    /** Unix timestamp of the data calculation */
    dt: Guardian.number(),
    /** System-level metadata */
    sys: Guardian.object({
      /** Internal parameter (optional) */
      type: Guardian.number().optional(),
      /** Internal parameter (optional) */
      id: Guardian.number().optional(),
      /** ISO 3166 country code (optional) */
      country: Guardian.string().optional(),
      /** Unix sunrise time */
      sunrise: Guardian.number(),
      /** Unix sunset time */
      sunset: Guardian.number(),
    }),
    /** Shift in seconds from UTC */
    timezone: Guardian.number(),
    /** City ID */
    id: Guardian.number(),
    /** City name */
    name: Guardian.string(),
    /** Response code, echoed by the vendor */
    cod: codGuard,
  }).describe({
    title: 'Current weather response',
    description: 'Current weather conditions for a single location.',
  });
