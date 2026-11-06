import { type BaseGuardian, Guardian } from '@guardian';

/** One cloud layer of a decoded METAR. */
export type AviationWeatherCloudLayerSchema = {
  /** `FEW`, `SCT`, `BKN`, `OVC`, `VV`, ... */
  cover: string;
  /** Layer base, feet above ground level. */
  base?: number | null;
} & Record<string, unknown>;

/**
 * One METAR or SPECI as the Data API decodes it (`format=json`). Every field
 * it sends is kept, including ones not modelled here. `temp`/`dewp` are
 * the service's own decode; for the exact tenths use the remarks T-group in
 * `rawOb` (the client adds it as `remarkTemperatures`).
 */
export type AviationWeatherMetarSchema = {
  /** ICAO station id, e.g. `KNYC`. */
  icaoId: string;
  /** `METAR` (routine) or `SPECI` (special). */
  metarType: string;
  /** The report exactly as issued. */
  rawOb: string;
  /** Observation time, Unix seconds. */
  obsTime: number;
  /** Nominal report time (ISO 8601), e.g. the top of the hour for a :51 METAR. */
  reportTime?: string;
  /** When the service received the report (ISO 8601, millisecond precision). */
  receiptTime?: string;
  /** Temperature, °C. */
  temp?: number | null;
  /** Dewpoint, °C. */
  dewp?: number | null;
  /** Wind direction in degrees, or `VRB`. */
  wdir?: number | string | null;
  /** Wind speed, knots. */
  wspd?: number | null;
  /** Gust, knots. */
  wgst?: number | null;
  /** Visibility, statute miles; `10+` for 10 or more. */
  visib?: number | string | null;
  /** Altimeter, hPa. */
  altim?: number | null;
  /** Sea-level pressure, hPa. */
  slp?: number | null;
  /** Quality-control flags (bit field). */
  qcField?: number;
  /** Present weather, e.g. `-RA BR`. */
  wxString?: string | null;
  /** 3-hour pressure tendency, hPa. */
  presTend?: number | null;
  /** 6-hour maximum temperature, °C. */
  maxT?: number | null;
  /** 6-hour minimum temperature, °C. */
  minT?: number | null;
  /** 24-hour maximum temperature, °C. */
  maxT24?: number | null;
  /** 24-hour minimum temperature, °C. */
  minT24?: number | null;
  /** Hourly precipitation, inches. */
  precip?: number | null;
  /** 3-hour precipitation, inches. */
  pcp3hr?: number | null;
  /** 6-hour precipitation, inches. */
  pcp6hr?: number | null;
  /** 24-hour precipitation, inches. */
  pcp24hr?: number | null;
  /** Snow depth, inches. */
  snow?: number | null;
  /** Vertical visibility, feet. */
  vertVis?: number | null;
  /** Station latitude. */
  lat?: number;
  /** Station longitude. */
  lon?: number;
  /** Station elevation, metres. */
  elev?: number;
  /** Station name. */
  name?: string;
  /** Highest cover reported. */
  cover?: string;
  /** Cloud layers, lowest first. */
  clouds?: AviationWeatherCloudLayerSchema[];
  /** Flight category: `VFR`, `MVFR`, `IFR`, `LIFR`. */
  fltCat?: string;
} & Record<string, unknown>;

const num = () => Guardian.number().strict().nullable().optional();

/** One cloud layer. */
export const AviationWeatherCloudLayerSchemaObject: BaseGuardian<
  AviationWeatherCloudLayerSchema
> = Guardian.object({
  cover: Guardian.string(),
  base: num(),
}).passthrough() as BaseGuardian<AviationWeatherCloudLayerSchema>;

/**
 * Validates one decoded METAR/SPECI.
 *
 * @example
 * ```ts
 * import { AviationWeatherMetarSchemaObject } from '@tundraconnect/aviationweather/schemas';
 *
 * declare const row: unknown;
 * const [error, metar] = AviationWeatherMetarSchemaObject.safeParse(row);
 * if (!error) console.log(metar.icaoId, metar.rawOb);
 * ```
 */
export const AviationWeatherMetarSchemaObject: BaseGuardian<
  AviationWeatherMetarSchema
> = Guardian.object({
  icaoId: Guardian.string(),
  metarType: Guardian.string(),
  rawOb: Guardian.string(),
  obsTime: Guardian.number().strict().integer(),
  reportTime: Guardian.string().optional(),
  receiptTime: Guardian.string().optional(),
  temp: num(),
  dewp: num(),
  wdir: Guardian.unknown<number | string | null>().test(
    (v) => v === null || typeof v === 'number' || typeof v === 'string',
    'wdir must be a number or a string',
  ).optional(),
  wspd: num(),
  wgst: num(),
  visib: Guardian.unknown<number | string | null>().test(
    (v) => v === null || typeof v === 'number' || typeof v === 'string',
    'visib must be a number or a string',
  ).optional(),
  altim: num(),
  slp: num(),
  qcField: Guardian.number().strict().optional(),
  wxString: Guardian.string().nullable().optional(),
  presTend: num(),
  maxT: num(),
  minT: num(),
  maxT24: num(),
  minT24: num(),
  precip: num(),
  pcp3hr: num(),
  pcp6hr: num(),
  pcp24hr: num(),
  snow: num(),
  vertVis: num(),
  lat: Guardian.number().strict().optional(),
  lon: Guardian.number().strict().optional(),
  elev: Guardian.number().strict().optional(),
  name: Guardian.string().optional(),
  cover: Guardian.string().optional(),
  clouds: Guardian.array(AviationWeatherCloudLayerSchemaObject).optional(),
  fltCat: Guardian.string().optional(),
}).passthrough().describe({
  title: 'aviationweather.gov METAR',
  description:
    'One decoded METAR or SPECI from the Data API, with its raw text.',
}) as BaseGuardian<AviationWeatherMetarSchema>;
