import { type BaseGuardian, Guardian } from '@guardian';

/**
 * One forecast period of a TAF (the base period, or an `FM`/`TEMPO`/
 * `BECMG`/`PROB` change group). Every field is kept as sent.
 */
export type AviationWeatherTafPeriodSchema = {
  /** Period start, Unix seconds. */
  timeFrom: number;
  /** Period end, Unix seconds. */
  timeTo: number;
  /** End of the transition for `BECMG`, Unix seconds. */
  timeBec?: number | null;
  /** `FM`, `TEMPO`, `BECMG`, `PROB`, or `null` for the base period. */
  fcstChange?: string | null;
  /** Probability (%) for `PROB` groups. */
  probability?: number | null;
  /** Forecast temperatures, when the TAF carries TX/TN groups. */
  temp?: unknown[];
} & Record<string, unknown>;

/** One TAF as the Data API decodes it, with its raw text. */
export type AviationWeatherTafSchema = {
  /** ICAO station id. */
  icaoId: string;
  /** The TAF exactly as issued. */
  rawTAF: string;
  /** Issue time (ISO 8601). */
  issueTime: string;
  /** Bulletin time (ISO 8601). */
  bulletinTime?: string;
  /** When the service stored it (ISO 8601). */
  dbPopTime?: string;
  /** Validity start, Unix seconds. */
  validTimeFrom: number;
  /** Validity end, Unix seconds. */
  validTimeTo: number;
  /** `1` for the station's latest TAF. */
  mostRecent?: number;
  /** Remarks such as ` AMD` (amended). */
  remarks?: string;
  /** The forecast periods. */
  fcsts: AviationWeatherTafPeriodSchema[];
} & Record<string, unknown>;

/** One TAF forecast period. */
export const AviationWeatherTafPeriodSchemaObject: BaseGuardian<
  AviationWeatherTafPeriodSchema
> = Guardian.object({
  timeFrom: Guardian.number().strict(),
  timeTo: Guardian.number().strict(),
  timeBec: Guardian.number().strict().nullable().optional(),
  fcstChange: Guardian.string().nullable().optional(),
  probability: Guardian.number().strict().nullable().optional(),
  temp: Guardian.array(Guardian.unknown()).optional(),
}).passthrough() as BaseGuardian<AviationWeatherTafPeriodSchema>;

/**
 * Validates one decoded TAF.
 *
 * @example
 * ```ts
 * import { AviationWeatherTafSchemaObject } from '@tundraconnect/aviationweather/schemas';
 *
 * declare const row: unknown;
 * const [error, taf] = AviationWeatherTafSchemaObject.safeParse(row);
 * if (!error) console.log(taf.rawTAF);
 * ```
 */
export const AviationWeatherTafSchemaObject: BaseGuardian<
  AviationWeatherTafSchema
> = Guardian.object({
  icaoId: Guardian.string(),
  rawTAF: Guardian.string(),
  issueTime: Guardian.string(),
  bulletinTime: Guardian.string().optional(),
  dbPopTime: Guardian.string().optional(),
  validTimeFrom: Guardian.number().strict(),
  validTimeTo: Guardian.number().strict(),
  mostRecent: Guardian.number().strict().optional(),
  remarks: Guardian.string().optional(),
  fcsts: Guardian.array(AviationWeatherTafPeriodSchemaObject),
}).passthrough().describe({
  title: 'aviationweather.gov TAF',
  description: 'One decoded TAF from the Data API, with its raw text.',
}) as BaseGuardian<AviationWeatherTafSchema>;
