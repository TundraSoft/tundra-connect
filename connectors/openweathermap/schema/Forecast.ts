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
 * Schema for a single 3-hour forecast entry
 *
 * @example
 * ```typescript
 * const entry = {
 *   dt: 1700010800,
 *   main: {
 *     temp: 14.1,
 *     feels_like: 13.4,
 *     temp_min: 13.2,
 *     temp_max: 14.1,
 *     pressure: 1014,
 *     sea_level: 1014,
 *     grnd_level: 1009,
 *     humidity: 75,
 *     temp_kf: 0.9,
 *   },
 *   weather: [{ id: 800, main: 'Clear', description: 'clear sky', icon: '01n' }],
 *   clouds: { all: 5 },
 *   wind: { speed: 3.2, deg: 260 },
 *   visibility: 10000,
 *   pop: 0.1,
 *   sys: { pod: 'n' },
 *   dt_txt: '2023-11-14 21:00:00',
 * };
 * const [error, validated] = ForecastListItemSchemaObject.safeParse(entry);
 * ```
 */
export type ForecastListItemSchema = {
  /** Unix timestamp of the forecasted data */
  dt: number;
  /** Forecasted weather measurements */
  main: {
    /** Temperature */
    temp: number;
    /** Human perceived temperature */
    feels_like: number;
    /** Minimum temperature at this timestamp */
    temp_min: number;
    /** Maximum temperature at this timestamp */
    temp_max: number;
    /** Atmospheric pressure at sea level, hPa */
    pressure: number;
    /** Atmospheric pressure at sea level, hPa */
    sea_level: number;
    /** Atmospheric pressure at ground level, hPa */
    grnd_level: number;
    /** Humidity percentage */
    humidity: number;
    /** Internal parameter — temperature correction factor */
    temp_kf: number;
  };
  /** Weather condition entries (typically one) */
  weather: WeatherConditionSchema[];
  /** Cloudiness data */
  clouds: CloudsSchema;
  /** Wind data */
  wind: WindSchema;
  /** Visibility in meters */
  visibility: number;
  /** Probability of precipitation, 0-1 */
  pop: number;
  /** Rain volume (optional) */
  rain?: {
    /** Rain volume for the last 3 hours, mm */
    '3h': number;
  };
  /** Snow volume (optional) */
  snow?: {
    /** Snow volume for the last 3 hours, mm */
    '3h': number;
  };
  /** System-level metadata */
  sys: {
    /** Part of the day — `d` for day, `n` for night */
    pod: string;
  };
  /** Human-readable timestamp, ISO-like `YYYY-MM-DD HH:mm:ss` */
  dt_txt: string;
};

/** Schema for a single 3-hour forecast entry (see {@link ForecastListItemSchema}). */
export const ForecastListItemSchemaObject: BaseGuardian<
  ForecastListItemSchema
> = Guardian.object({
  /** Unix timestamp of the forecasted data */
  dt: Guardian.number(),
  /** Forecasted weather measurements */
  main: Guardian.object({
    /** Temperature */
    temp: Guardian.number(),
    /** Human perceived temperature */
    feels_like: Guardian.number(),
    /** Minimum temperature at this timestamp */
    temp_min: Guardian.number(),
    /** Maximum temperature at this timestamp */
    temp_max: Guardian.number(),
    /** Atmospheric pressure at sea level, hPa */
    pressure: Guardian.number(),
    /** Atmospheric pressure at sea level, hPa */
    sea_level: Guardian.number(),
    /** Atmospheric pressure at ground level, hPa */
    grnd_level: Guardian.number(),
    /** Humidity percentage */
    humidity: Guardian.number(),
    /** Internal parameter — temperature correction factor */
    temp_kf: Guardian.number(),
  }),
  /** Weather condition entries (typically one) */
  weather: Guardian.array(WeatherConditionSchemaObject).minLength(1),
  /** Cloudiness data */
  clouds: CloudsSchemaObject,
  /** Wind data */
  wind: WindSchemaObject,
  /** Visibility in meters */
  visibility: Guardian.number(),
  /** Probability of precipitation, 0-1 */
  pop: Guardian.number().min(0).max(1),
  /** Rain volume (optional) */
  rain: Guardian.object({
    /** Rain volume for the last 3 hours, mm */
    '3h': Guardian.number(),
  }).optional(),
  /** Snow volume (optional) */
  snow: Guardian.object({
    /** Snow volume for the last 3 hours, mm */
    '3h': Guardian.number(),
  }).optional(),
  /** System-level metadata */
  sys: Guardian.object({
    /** Part of the day — `d` for day, `n` for night */
    pod: Guardian.string().isIn(['d', 'n']),
  }),
  /** Human-readable timestamp, ISO-like `YYYY-MM-DD HH:mm:ss` */
  dt_txt: Guardian.string(),
}).describe({
  title: 'Forecast entry',
  description: 'One 3-hour forecast timestamp.',
});

/**
 * Schema for the OpenWeatherMap 5-day/3-hour forecast response
 *
 * This schema validates the response from the `/forecast` endpoint. Note
 * that unlike {@link CurrentWeatherSchemaObject}, this endpoint's top-level
 * `cod` is documented as a string (`"200"`) rather than a number — a
 * genuine, confirmed OpenWeatherMap inconsistency, not a typo. Both shapes
 * are accepted via the shared {@link codGuard}.
 *
 * @example
 * ```typescript
 * const forecastData = {
 *   cod: '200',
 *   message: 0,
 *   cnt: 1,
 *   list: [ ... ],
 *   city: {
 *     id: 2643743,
 *     name: 'London',
 *     coord: { lat: 51.51, lon: -0.13 },
 *     country: 'GB',
 *     population: 1000000,
 *     timezone: 0,
 *     sunrise: 1699945200,
 *     sunset: 1699977600,
 *   },
 * };
 *
 * const [error, validated] = ForecastSchemaObject.safeParse(forecastData);
 * if (!error) {
 *   console.log('First forecast temp:', validated.list[0]?.main.temp);
 * }
 * ```
 */
export type ForecastSchema = {
  /** Response code, echoed by the vendor as a string on this endpoint */
  cod: CodSchema;
  /** Internal parameter */
  message: number;
  /** Number of forecast timestamps returned */
  cnt: number;
  /** Forecast entries, one per 3-hour timestamp */
  list: ForecastListItemSchema[];
  /** City metadata the forecast was resolved against */
  city: {
    /** City ID */
    id: number;
    /** City name */
    name: string;
    /** Geographic coordinates of the city */
    coord: CoordSchema;
    /** ISO 3166 country code */
    country: string;
    /** City population */
    population: number;
    /** Shift in seconds from UTC */
    timezone: number;
    /** Unix sunrise time */
    sunrise: number;
    /** Unix sunset time */
    sunset: number;
  };
};

/** Schema for the OpenWeatherMap 5-day/3-hour forecast response (see {@link ForecastSchema}). */
export const ForecastSchemaObject: BaseGuardian<ForecastSchema> = Guardian
  .object({
    /** Response code, echoed by the vendor as a string on this endpoint */
    cod: codGuard,
    /** Internal parameter */
    message: Guardian.number(),
    /** Number of forecast timestamps returned */
    cnt: Guardian.number(),
    /** Forecast entries, one per 3-hour timestamp */
    list: Guardian.array(ForecastListItemSchemaObject),
    /** City metadata the forecast was resolved against */
    city: Guardian.object({
      /** City ID */
      id: Guardian.number(),
      /** City name */
      name: Guardian.string(),
      /** Geographic coordinates of the city */
      coord: CoordSchemaObject,
      /** ISO 3166 country code */
      country: Guardian.string(),
      /** City population */
      population: Guardian.number(),
      /** Shift in seconds from UTC */
      timezone: Guardian.number(),
      /** Unix sunrise time */
      sunrise: Guardian.number(),
      /** Unix sunset time */
      sunset: Guardian.number(),
    }),
  }).describe({
    title: 'Forecast response',
    description: '5-day weather forecast in 3-hour steps.',
  });
