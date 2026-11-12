import { type BaseGuardian, Guardian } from '@guardian';

/**
 * One time-series block — `hourly`, `minutely_15` or `daily`. `time` holds
 * the timestamps (ISO 8601 local-time strings, or Unix seconds with
 * `timeformat: 'unixtime'`); every other key is one column, exactly as
 * Open-Meteo named it, with one value per timestamp.
 *
 * Column names carry the request's own detail: with several `models` each
 * variable is suffixed by the model (`temperature_2m_gfs_seamless`), the
 * Ensemble API adds a member (`temperature_2m_member07_ncep_gefs_seamless`),
 * and the Previous Runs API keeps the `_previous_dayN` you asked for. The
 * package's `columns()` helper splits them back out. A value is
 * `null` where the model has no data for that step; it is never filled in.
 */
export type OpenMeteoSeriesBlockSchema = {
  /** Timestamp of each step. */
  time: (string | number)[];
} & Record<string, (number | string | null)[]>;

/** One value per variable at a single instant (the `current` block). */
export type OpenMeteoCurrentBlockSchema = {
  /** Timestamp of the values. */
  time: string | number;
  /** Seconds the values are representative for (900 for 15-minute data). */
  interval: number;
} & Record<string, number | string | null>;

/**
 * Open-Meteo's answer for one location. Every field it sends is kept,
 * including ones this schema doesn't model.
 */
export type OpenMeteoForecastSchema = {
  /** Latitude of the grid cell the data comes from (not the one requested). */
  latitude: number;
  /** Longitude of the grid cell the data comes from. */
  longitude: number;
  /** Elevation (m) used for statistical downscaling. */
  elevation?: number;
  /** Server time spent generating the response, in milliseconds. */
  generationtime_ms?: number;
  /** Offset of `timezone` from UTC, in seconds. */
  utc_offset_seconds: number;
  /** Timezone the timestamps are in (`GMT` unless one was requested). */
  timezone: string;
  /** Abbreviation of `timezone`. */
  timezone_abbreviation: string;
  /** Position of this location in a multi-location request (0-based). */
  location_id?: number;
  /** Units for each `current` value. */
  current_units?: Record<string, string>;
  /** Values at the current 15-minute step. */
  current?: OpenMeteoCurrentBlockSchema;
  /** Units for each `hourly` column. */
  hourly_units?: Record<string, string>;
  /** Hourly time series. */
  hourly?: OpenMeteoSeriesBlockSchema;
  /** Units for each `minutely_15` column. */
  minutely_15_units?: Record<string, string>;
  /** 15-minute time series (native for HRRR, ICON-D2 and a few others; interpolated elsewhere). */
  minutely_15?: OpenMeteoSeriesBlockSchema;
  /** Units for each `daily` column. */
  daily_units?: Record<string, string>;
  /** Daily aggregates. */
  daily?: OpenMeteoSeriesBlockSchema;
} & Record<string, unknown>;

const isCell = (v: unknown): boolean =>
  v === null || typeof v === 'number' || typeof v === 'string';

/** `true` for `{ time: [...], <column>: [...] }` with every column as long as `time`. */
const isSeriesBlock = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  const block = value as Record<string, unknown>;
  const time = block.time;
  if (!Array.isArray(time) || !time.every(isCell)) return false;
  return Object.values(block).every((column) =>
    Array.isArray(column) && column.length === time.length &&
    column.every(isCell)
  );
};

/** `true` for `{ <name>: <unit string> }`. */
const isUnits = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.values(value).every((unit) => typeof unit === 'string');

/** `true` for `{ time, interval, <variable>: <value> }`. */
const isCurrentBlock = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.values(value).every(isCell);

/**
 * A series block: every column must be an array of numbers, strings or
 * nulls exactly as long as `time`. A ragged block fails validation instead
 * of being trimmed.
 */
export const OpenMeteoSeriesBlockSchemaObject: BaseGuardian<
  OpenMeteoSeriesBlockSchema
> = Guardian.unknown<OpenMeteoSeriesBlockSchema>().test(
  isSeriesBlock,
  'expected { time: [...], <column>: [...] } with every column as long as time',
);

/** The `current` block: scalar values keyed by variable. */
export const OpenMeteoCurrentBlockSchemaObject: BaseGuardian<
  OpenMeteoCurrentBlockSchema
> = Guardian.unknown<OpenMeteoCurrentBlockSchema>().test(
  isCurrentBlock,
  'expected { time, interval, <variable>: <number | string | null> }',
);

const units: BaseGuardian<Record<string, string>> = Guardian.unknown<
  Record<string, string>
>().test(isUnits, 'expected { <column>: <unit> }');

/**
 * One location's response from the Forecast, Ensemble, Previous Runs,
 * Historical Forecast, Single Runs or Historical Weather (archive) API —
 * they all share this shape.
 *
 * @example
 * ```ts
 * import { OpenMeteoForecastSchemaObject } from '@tundraconnect/open-meteo/schemas';
 *
 * declare const body: unknown;
 * const [error, forecast] = OpenMeteoForecastSchemaObject.safeParse(body);
 * if (!error) console.log(forecast.hourly?.time.length);
 * ```
 */
export const OpenMeteoForecastSchemaObject: BaseGuardian<
  OpenMeteoForecastSchema
> = Guardian.object({
  latitude: Guardian.number().strict(),
  longitude: Guardian.number().strict(),
  elevation: Guardian.number().strict().optional(),
  generationtime_ms: Guardian.number().strict().optional(),
  utc_offset_seconds: Guardian.number().strict(),
  timezone: Guardian.string(),
  timezone_abbreviation: Guardian.string(),
  location_id: Guardian.number().strict().optional(),
  current_units: units.optional(),
  current: OpenMeteoCurrentBlockSchemaObject.optional(),
  hourly_units: units.optional(),
  hourly: OpenMeteoSeriesBlockSchemaObject.optional(),
  minutely_15_units: units.optional(),
  minutely_15: OpenMeteoSeriesBlockSchemaObject.optional(),
  daily_units: units.optional(),
  daily: OpenMeteoSeriesBlockSchemaObject.optional(),
}).passthrough().describe({
  title: 'Open-Meteo location response',
  description:
    'One location from any Open-Meteo weather API: grid cell, timezone and the requested current/hourly/minutely_15/daily blocks.',
}) as BaseGuardian<OpenMeteoForecastSchema>;
