/**
 * @fileoverview Pure helpers for reading Open-Meteo series blocks. They
 * never change a value: they only tell you which column is which.
 *
 * @module
 */

import type { OpenMeteoSeriesBlockSchema } from './schema/mod.ts';

/** One column of a series block, with its name split into parts. */
export type OpenMeteoColumn = {
  /** The column name exactly as Open-Meteo sent it. */
  key: string;
  /** The requested variable it belongs to, e.g. `temperature_2m`. */
  variable: string;
  /**
   * Ensemble member number (`_member07` → 7). `0` is the control run, which
   * Open-Meteo sends without a member suffix. `null` outside the Ensemble API.
   */
  member: number | null;
  /**
   * The model suffix Open-Meteo appended (`gfs_seamless`,
   * `ncep_gefs_seamless`, ...), or `null` when it sent none (a single-model
   * request). It can differ from the name you requested: the Ensemble API
   * answers `gfs_seamless` with `ncep_gefs_seamless`.
   */
  model: string | null;
  /** The values, one per `time` step. */
  values: (number | string | null)[];
};

const MEMBER = /^member(\d+)(?:_(.+))?$/;

/**
 * Splits every column of `block` into variable, ensemble member and model.
 *
 * Pass the variable names you requested: they are matched longest first,
 * so `temperature_2m_max` never reads as `temperature_2m` plus a model
 * called `max`. Columns that match none of them (and `time`) are left out.
 *
 * @param block - A `hourly`, `minutely_15` or `daily` block.
 * @param variables - The variable names you requested for that block.
 * @returns One entry per matched column, in the order Open-Meteo sent them.
 *
 * @example
 * ```ts
 * import { columns, OpenMeteo } from '@tundraconnect/open-meteo';
 *
 * const client = new OpenMeteo();
 * const [nyc] = await client.ensemble({
 *   latitude: 40.78,
 *   longitude: -73.97,
 *   hourly: ['temperature_2m'],
 *   models: ['gfs_seamless'],
 * });
 * const members = columns(nyc!.hourly!, ['temperature_2m']);
 * console.log(members.length, members[0]?.member, members[0]?.model);
 * ```
 */
export function columns(
  block: OpenMeteoSeriesBlockSchema,
  variables: readonly string[],
): OpenMeteoColumn[] {
  const byLength = [...variables].sort((a, b) => b.length - a.length);
  const out: OpenMeteoColumn[] = [];
  for (const [key, values] of Object.entries(block)) {
    if (key === 'time') continue;
    const variable = byLength.find((v) => key === v || key.startsWith(`${v}_`));
    if (variable === undefined) continue;
    const rest = key.slice(variable.length + 1);
    let member: number | null = null;
    let model: string | null = rest === '' ? null : rest;
    const m = MEMBER.exec(rest);
    if (m) {
      member = Number(m[1]);
      model = m[2] ?? null;
    }
    out.push({ key, variable, member, model, values });
  }
  // An ensemble's control run carries no member suffix: number it 0 when
  // the same variable+model also has numbered members.
  for (const column of out) {
    if (
      column.member === null &&
      out.some((c) =>
        c.member !== null && c.variable === column.variable &&
        c.model === column.model
      )
    ) {
      column.member = 0;
    }
  }
  return out;
}
