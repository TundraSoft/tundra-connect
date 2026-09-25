import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Common schema components for OpenWeatherMap API responses
 *
 * This module provides reusable Guardian validation components that are used
 * across multiple OpenWeatherMap API endpoint schemas. These components help
 * ensure consistent validation and reduce code duplication.
 *
 * @example
 * ```typescript
 * import { codGuard, CoordSchemaObject, WeatherConditionSchemaObject } from './Common.ts';
 *
 * // Use individual guards in custom schemas
 * const customSchema = Guardian.object({
 *   cod: codGuard,
 *   coord: CoordSchemaObject,
 *   weather: Guardian.array(WeatherConditionSchemaObject),
 * });
 * ```
 */

/** Type for OpenWeatherMap's inconsistently-typed `cod` field. */
export type CodSchema = number | string;

/**
 * Validates OpenWeatherMap's `cod` field.
 *
 * OpenWeatherMap is genuinely inconsistent about whether `cod` is a number
 * or a numeric string: the current-weather endpoint returns it as a number
 * (`200`) while the 5-day forecast endpoint returns it as a string
 * (`"200"`) — and error envelopes on either endpoint may echo it as either
 * type. Rather than duplicate a number-vs-string guard per schema, every
 * `cod` field (success or error) shares this one permissive validator.
 *
 * The number branch uses `.strict()` to opt out of `NumberGuardian`'s
 * default coercion: without it, `oneOf` (which tries its guards in order)
 * would let the forecast endpoint's string `"200"` resolve through the
 * number branch first, silently normalizing it into a number and defeating
 * the union's intent of preserving which shape the caller actually sent.
 * With `.strict()`, a numeric-looking string correctly fails the number
 * branch and falls through to match the string branch instead (mirrors
 * `telegram/schema/Common.ts`'s `chatIdGuard`, which has the same
 * number-or-string shape).
 *
 * The string branch can't just be `Guardian.string()`, though: unlike
 * `NumberGuardian`/`BooleanGuardian`, `StringGuardian` has no `.strict()`
 * of its own — it always coerces a number/boolean to its string form.
 * Without a guard, a rejected number-branch input like `true` would fall
 * through and get silently stringified to `'true'` instead of being
 * rejected. `Guardian.unknown().test()` here only inspects `typeof` (no
 * coercion), so it fills that gap the same way the number branch's
 * `.strict()` does for its own type.
 */
export const codGuard: BaseGuardian<CodSchema> = Guardian.oneOf([
  Guardian.number().strict(),
  Guardian.unknown<string>().test(
    (value) => typeof value === 'string',
    'cod must be a number or a numeric string',
  ),
], 'cod must be a number or a numeric string')
  .describe({
    title: 'Response code',
    description:
      'OpenWeatherMap status code echoed on the response — a number on some endpoints, a numeric string on others.',
  });

/**
 * Schema for a geographic coordinate pair
 *
 * @example
 * ```typescript
 * const coord = { lon: -0.13, lat: 51.51 };
 * const [error, validatedCoord] = CoordSchemaObject.safeParse(coord);
 * ```
 */
export type CoordSchema = {
  /** Longitude of the location */
  lon: number;
  /** Latitude of the location */
  lat: number;
};

/** Schema for a geographic coordinate pair (see {@link CoordSchema}). */
export const CoordSchemaObject: BaseGuardian<CoordSchema> = Guardian.object({
  /** Longitude of the location */
  lon: Guardian.number(),
  /** Latitude of the location */
  lat: Guardian.number(),
}).describe({
  title: 'Coordinates',
  description: 'Geographic longitude/latitude pair.',
});

/**
 * Schema for a single weather condition entry
 *
 * OpenWeatherMap always returns `weather` as an array of these — typically
 * one entry, occasionally more (e.g. rain + fog simultaneously).
 *
 * @example
 * ```typescript
 * const condition = {
 *   id: 800,
 *   main: 'Clear',
 *   description: 'clear sky',
 *   icon: '01d',
 * };
 * const [error, validated] = WeatherConditionSchemaObject.safeParse(condition);
 * ```
 */
export type WeatherConditionSchema = {
  /** Vendor weather condition code */
  id: number;
  /** Group of weather parameters (Rain, Snow, Clouds, etc.) */
  main: string;
  /** Human-readable weather condition description */
  description: string;
  /** Weather icon identifier */
  icon: string;
};

/** Schema for a single weather condition entry (see {@link WeatherConditionSchema}). */
export const WeatherConditionSchemaObject: BaseGuardian<
  WeatherConditionSchema
> = Guardian.object({
  /** Vendor weather condition code */
  id: Guardian.number(),
  /** Group of weather parameters (Rain, Snow, Clouds, etc.) */
  main: Guardian.string(),
  /** Human-readable weather condition description */
  description: Guardian.string(),
  /** Weather icon identifier */
  icon: Guardian.string(),
}).describe({
  title: 'Weather condition',
  description: 'One entry of the vendor weather-condition catalogue.',
});

/**
 * Schema for cloudiness data
 *
 * @example
 * ```typescript
 * const clouds = { all: 20 };
 * const [error, validated] = CloudsSchemaObject.safeParse(clouds);
 * ```
 */
export type CloudsSchema = {
  /** Cloudiness percentage */
  all: number;
};

/** Schema for cloudiness data (see {@link CloudsSchema}). */
export const CloudsSchemaObject: BaseGuardian<CloudsSchema> = Guardian.object(
  {
    /** Cloudiness percentage */
    all: Guardian.number().min(0).max(100),
  },
).describe({
  title: 'Cloudiness',
  description: 'Cloudiness percentage (0-100).',
});

/**
 * Schema for wind data
 *
 * @example
 * ```typescript
 * const wind = { speed: 4.1, deg: 280, gust: 6.7 };
 * const [error, validated] = WindSchemaObject.safeParse(wind);
 * ```
 */
export type WindSchema = {
  /** Wind speed */
  speed: number;
  /** Wind direction in degrees */
  deg: number;
  /** Wind gust speed (optional) */
  gust?: number;
};

/** Schema for wind data (see {@link WindSchema}). */
export const WindSchemaObject: BaseGuardian<WindSchema> = Guardian.object({
  /** Wind speed */
  speed: Guardian.number().min(0),
  /** Wind direction in degrees */
  deg: Guardian.number(),
  /** Wind gust speed (optional) */
  gust: Guardian.number().min(0).optional(),
}).describe({
  title: 'Wind',
  description: 'Wind speed, direction, and optional gust speed.',
});
