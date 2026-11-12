/**
 * @fileoverview Exact temperatures from a METAR's remarks section.
 *
 * The body of a METAR rounds temperature to whole °C (`16/15`). US ASOS
 * stations repeat it to a tenth of a degree in the remarks T-group
 * (`T01610150` = 16.1 °C, dewpoint 15.0 °C), and synoptic-hour reports add
 * the 6-hour (`1snTTT`, `2snTTT`) and 24-hour (`4snTTTsnTTT`) extremes.
 * These are the values temperature markets settle on, so they are read
 * straight from the raw text, never from a rounded decoded field.
 *
 * @module
 */

/** One temperature group exactly as it appeared, plus its value. */
export type MetarRemarkGroup = {
  /** The group text, e.g. `T01610150` or `10200`. */
  group: string;
};

/** The temperature groups found in one report's remarks. */
export type MetarRemarkTemperatures = {
  /** `TsnTTTsnTTT`: temperature and dewpoint at observation time, to 0.1 °C. */
  hourly?: MetarRemarkGroup & {
    temperatureC: number;
    /** `null` when the group carries no dewpoint (`T0161`). */
    dewpointC: number | null;
  };
  /** `1snTTT`: highest temperature in the past 6 hours, to 0.1 °C. */
  sixHourMax?: MetarRemarkGroup & { temperatureC: number };
  /** `2snTTT`: lowest temperature in the past 6 hours, to 0.1 °C. */
  sixHourMin?: MetarRemarkGroup & { temperatureC: number };
  /** `4snTTTsnTTT`: 24-hour maximum and minimum (midnight LST report), to 0.1 °C. */
  twentyFourHour?: MetarRemarkGroup & { maxC: number; minC: number };
};

const T_GROUP = /^T([01])(\d{3})(?:([01])(\d{3}))?$/;
const MAX_6H = /^1([01])(\d{3})$/;
const MIN_6H = /^2([01])(\d{3})$/;
const EXTREMES_24H = /^4([01])(\d{3})([01])(\d{3})$/;

/** `sign` 1 is negative; the three digits are tenths of a degree. */
const tenths = (sign: string, digits: string): number =>
  (sign === '1' ? -1 : 1) * Number(digits) / 10;

/**
 * Reads the temperature groups from a METAR/SPECI's remarks.
 *
 * Only tokens after `RMK` are considered, each matched as a whole token,
 * so nothing in the report body (a runway group, a visibility) is
 * mistaken for one. Missing groups are simply absent; a group with
 * missing digits (`1////`) is ignored.
 *
 * @param rawOb - The full raw report text.
 * @returns The groups found; an empty object when there are none.
 *
 * @example
 * ```ts
 * import { parseRemarkTemperatures } from '@tundraconnect/aviationweather';
 *
 * const t = parseRemarkTemperatures(
 *   'METAR KNYC 061751Z AUTO 00000KT 3SM -RA BR OVC060 19/18 A2985 RMK AO2 SLP099 T01890183 10200 20189',
 * );
 * console.log(t.hourly?.temperatureC, t.sixHourMax?.temperatureC); // 18.9 20
 * ```
 */
export function parseRemarkTemperatures(
  rawOb: string,
): MetarRemarkTemperatures {
  const out: MetarRemarkTemperatures = {};
  const tokens = rawOb.trim().split(/\s+/);
  const rmk = tokens.indexOf('RMK');
  if (rmk === -1) return out;
  for (const token of tokens.slice(rmk + 1)) {
    const group = token.replace(/=$/, '');
    let m: RegExpExecArray | null;
    if (!out.hourly && (m = T_GROUP.exec(group))) {
      out.hourly = {
        group,
        temperatureC: tenths(m[1]!, m[2]!),
        dewpointC: m[3] !== undefined ? tenths(m[3], m[4]!) : null,
      };
    } else if (!out.sixHourMax && (m = MAX_6H.exec(group))) {
      out.sixHourMax = { group, temperatureC: tenths(m[1]!, m[2]!) };
    } else if (!out.sixHourMin && (m = MIN_6H.exec(group))) {
      out.sixHourMin = { group, temperatureC: tenths(m[1]!, m[2]!) };
    } else if (!out.twentyFourHour && (m = EXTREMES_24H.exec(group))) {
      out.twentyFourHour = {
        group,
        maxC: tenths(m[1]!, m[2]!),
        minC: tenths(m[3]!, m[4]!),
      };
    }
  }
  return out;
}
