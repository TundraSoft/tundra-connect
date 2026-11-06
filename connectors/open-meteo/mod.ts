/**
 * Typed, cross-runtime client for the [Open-Meteo](https://open-meteo.com/)
 * weather APIs: Forecast, Ensemble (every member), Previous Runs,
 * Historical Forecast, Single Runs and the Historical Weather archive —
 * any variable by name, any model by id, nothing resampled or rounded.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`OpenMeteoError` and its code registry).
 *
 * @example
 * ```ts
 * import { OpenMeteo } from '@tundraconnect/open-meteo';
 *
 * const client = new OpenMeteo();
 * const [nyc] = await client.forecast({
 *   latitude: 40.7794,
 *   longitude: -73.9692,
 *   hourly: ['temperature_2m'],
 *   models: ['ncep_hrrr_conus', 'ecmwf_ifs025'],
 * });
 * console.log(nyc?.hourly?.temperature_2m_ncep_hrrr_conus);
 * ```
 *
 * @module
 */

export {
  OPEN_METEO_CUSTOMER_HOSTS,
  OPEN_METEO_FREE_HOSTS,
  OPEN_METEO_MODELS,
  OpenMeteo,
  type OpenMeteoApi,
  type OpenMeteoArchiveQuery,
  type OpenMeteoAuth,
  type OpenMeteoOptions,
  type OpenMeteoParamValue,
  type OpenMeteoPreviousRunsQuery,
  type OpenMeteoQuery,
  type OpenMeteoSingleRunQuery,
} from './OpenMeteo.ts';

export { columns, type OpenMeteoColumn } from './series.ts';

export * from './errors/mod.ts';

export * from './schema/mod.ts';
