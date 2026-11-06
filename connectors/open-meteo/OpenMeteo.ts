import {
  type ResponseBody,
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerRateLimitError,
  RESTlerRequestError,
  type RESTlerRequestOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
  RESTlerTimeoutError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, Guardian, GuardianError } from '@guardian';
import {
  OpenMeteoErrorBodySchemaObject,
  type OpenMeteoForecastSchema,
  OpenMeteoForecastSchemaObject,
} from './schema/mod.ts';
import { OpenMeteoError, type OpenMeteoErrorCode } from './errors/mod.ts';

/** The Open-Meteo weather APIs this client calls, each on its own host. */
export type OpenMeteoApi =
  | 'forecast'
  | 'ensemble'
  | 'previousRuns'
  | 'historicalForecast'
  | 'singleRuns'
  | 'archive';

/** Free (non-commercial) hosts — the default. */
export const OPEN_METEO_FREE_HOSTS: Readonly<Record<OpenMeteoApi, string>> = {
  forecast: 'https://api.open-meteo.com',
  ensemble: 'https://ensemble-api.open-meteo.com',
  previousRuns: 'https://previous-runs-api.open-meteo.com',
  historicalForecast: 'https://historical-forecast-api.open-meteo.com',
  singleRuns: 'https://single-runs-api.open-meteo.com',
  archive: 'https://archive-api.open-meteo.com',
};

/** Paid-plan hosts, used automatically when `auth` carries an API key. */
export const OPEN_METEO_CUSTOMER_HOSTS: Readonly<Record<OpenMeteoApi, string>> =
  {
    forecast: 'https://customer-api.open-meteo.com',
    ensemble: 'https://customer-ensemble-api.open-meteo.com',
    previousRuns: 'https://customer-previous-runs-api.open-meteo.com',
    historicalForecast:
      'https://customer-historical-forecast-api.open-meteo.com',
    singleRuns: 'https://customer-single-runs-api.open-meteo.com',
    archive: 'https://customer-archive-api.open-meteo.com',
  };

const PATHS: Record<OpenMeteoApi, string> = {
  forecast: '/v1/forecast',
  ensemble: '/v1/ensemble',
  previousRuns: '/v1/forecast',
  historicalForecast: '/v1/forecast',
  singleRuns: '/v1/forecast',
  archive: '/v1/archive',
};

/**
 * Open-Meteo's paid-plan API key, sent as the `apikey` query parameter.
 * Commercial use requires a paid plan; without `auth` the client uses the
 * free, non-commercial hosts.
 */
export type OpenMeteoAuth = {
  type: 'CUSTOM';
  /** API key from your Open-Meteo subscription. */
  apiKey: string;
};

/** Options for configuring an {@link OpenMeteo} client. */
export type OpenMeteoOptions = Omit<RESTlerOptions, 'auth'> & {
  /** Paid-plan API key. Switches every call to the `customer-*` hosts. */
  auth?: OpenMeteoAuth;
  /**
   * Override the host of one or more APIs (a self-hosted Open-Meteo, a
   * proxy). Each must be an `https://` origin (or `http://` for
   * `localhost`). Takes precedence over the free/customer default.
   */
  hosts?: Partial<Record<OpenMeteoApi, string>>;
};

/** A value accepted by `params` — arrays are sent comma-separated. */
export type OpenMeteoParamValue =
  | string
  | number
  | boolean
  | readonly (string | number)[];

/**
 * The query every Open-Meteo weather API shares. Names are camelCased;
 * anything not modelled here goes in `params` under Open-Meteo's own name
 * and is sent verbatim.
 */
export type OpenMeteoQuery = {
  /** Latitude(s) in WGS84. Several values request several locations at once. */
  latitude: number | readonly number[];
  /** Longitude(s), one per latitude. */
  longitude: number | readonly number[];
  /** Elevation(s) in metres for downscaling; one per location, or omit. */
  elevation?: number | readonly number[];
  /** Hourly variables by name, e.g. `temperature_2m`. Any variable the API offers. */
  hourly?: readonly string[];
  /** 15-minutely variables by name. */
  minutely15?: readonly string[];
  /** Daily aggregates by name, e.g. `temperature_2m_max`. */
  daily?: readonly string[];
  /** Current-conditions variables by name. */
  current?: readonly string[];
  /**
   * Weather models by Open-Meteo id — `gfs_seamless`, `ncep_hrrr_conus`,
   * `ncep_hrrr_conus_15min`, `ecmwf_ifs025`, `ecmwf_ifs`, `icon_seamless`,
   * `icon_d2`, `gem_seamless`, `meteofrance_seamless`, `ukmo_seamless`,
   * `jma_seamless`, ... (see {@link OPEN_METEO_MODELS}). Omit for
   * Open-Meteo's `best_match` blend. With several models every column is
   * suffixed by its model.
   */
  models?: readonly string[];
  /** IANA timezone for timestamps and daily aggregation, or `auto`. Default `GMT`. */
  timezone?: string;
  /** `iso8601` (default) or `unixtime` (Unix seconds — unambiguous across DST). */
  timeformat?: 'iso8601' | 'unixtime';
  /** @default 'celsius' */
  temperatureUnit?: 'celsius' | 'fahrenheit';
  /** @default 'kmh' */
  windSpeedUnit?: 'kmh' | 'ms' | 'mph' | 'kn';
  /** @default 'mm' */
  precipitationUnit?: 'mm' | 'inch';
  /** Days before today to include. */
  pastDays?: number;
  /** Days to forecast. */
  forecastDays?: number;
  /** Hours before now to include (hourly). */
  pastHours?: number;
  /** Hours to forecast (hourly). */
  forecastHours?: number;
  /** 15-minute steps before now to include. */
  pastMinutely15?: number;
  /** 15-minute steps to forecast. */
  forecastMinutely15?: number;
  /** First day, `YYYY-MM-DD`. */
  startDate?: string;
  /** Last day (inclusive), `YYYY-MM-DD`. */
  endDate?: string;
  /** First hour, `YYYY-MM-DDTHH:MM`. */
  startHour?: string;
  /** Last hour, `YYYY-MM-DDTHH:MM`. */
  endHour?: string;
  /** First 15-minute step, `YYYY-MM-DDTHH:MM`. */
  startMinutely15?: string;
  /** Last 15-minute step, `YYYY-MM-DDTHH:MM`. */
  endMinutely15?: string;
  /** Grid-cell choice: `land` (default), `sea` or `nearest`. */
  cellSelection?: 'land' | 'sea' | 'nearest';
  /** Any other Open-Meteo parameter, by its own name, sent as-is. */
  params?: Record<string, OpenMeteoParamValue>;
};

/** Query for {@link OpenMeteo.previousRuns}. */
export type OpenMeteoPreviousRunsQuery = OpenMeteoQuery & {
  /**
   * Also request each `hourly` and `minutely15` variable as forecast this
   * many days earlier: `[1, 2]` adds `temperature_2m_previous_day1` and
   * `temperature_2m_previous_day2` next to `temperature_2m`. Variables you
   * already named with a `_previous_dayN` suffix are left alone.
   */
  previousDays?: readonly number[];
};

/** Query for {@link OpenMeteo.singleRun}. */
export type OpenMeteoSingleRunQuery = OpenMeteoQuery & {
  /** Model run (initialisation time, UTC), `YYYY-MM-DDTHH:MM`, e.g. `2026-11-05T00:00`. */
  run: string;
};

/** Query for {@link OpenMeteo.archive}: a date range is required. */
export type OpenMeteoArchiveQuery = OpenMeteoQuery & {
  startDate: string;
  endDate: string;
};

/**
 * Commonly used model ids, for autocompletion and discovery. Not a limit:
 * any id Open-Meteo accepts can be passed in `models`.
 */
export const OPEN_METEO_MODELS = [
  'best_match',
  'gfs_seamless',
  'gfs_global',
  'gfs_hrrr',
  'ncep_hrrr_conus',
  'ncep_hrrr_conus_15min',
  'ncep_nbm_conus',
  'ecmwf_ifs',
  'ecmwf_ifs025',
  'ecmwf_aifs025_single',
  'icon_seamless',
  'icon_global',
  'icon_eu',
  'icon_d2',
  'gem_seamless',
  'meteofrance_seamless',
  'ukmo_seamless',
  'jma_seamless',
  'knmi_seamless',
  'dmi_seamless',
  'metno_seamless',
  'bom_access_global',
  'cma_grapes_global',
] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** camelCase query key → Open-Meteo parameter. */
const SCALARS: Record<string, string> = {
  timezone: 'timezone',
  timeformat: 'timeformat',
  temperatureUnit: 'temperature_unit',
  windSpeedUnit: 'wind_speed_unit',
  precipitationUnit: 'precipitation_unit',
  pastDays: 'past_days',
  forecastDays: 'forecast_days',
  pastHours: 'past_hours',
  forecastHours: 'forecast_hours',
  pastMinutely15: 'past_minutely_15',
  forecastMinutely15: 'forecast_minutely_15',
  startDate: 'start_date',
  endDate: 'end_date',
  startHour: 'start_hour',
  endHour: 'end_hour',
  startMinutely15: 'start_minutely_15',
  endMinutely15: 'end_minutely_15',
  cellSelection: 'cell_selection',
  run: 'run',
};

const LISTS: Record<string, string> = {
  hourly: 'hourly',
  minutely15: 'minutely_15',
  daily: 'daily',
  current: 'current',
  models: 'models',
};

const isLocalHost = (url: URL): boolean =>
  url.hostname === 'localhost' || url.hostname === '127.0.0.1' ||
  url.hostname === '[::1]';

/**
 * Open-Meteo weather client: the Forecast, Ensemble, Previous Runs,
 * Historical Forecast, Single Runs and Historical Weather (archive) APIs,
 * each with an explicit model choice and any variable by name.
 *
 * Nothing is resampled, merged or rounded: every column Open-Meteo sends
 * (every model, every ensemble member, every `null`) is returned as-is,
 * along with the grid cell, timezone and units. Every call returns one
 * entry per requested location, in request order.
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
 *   minutely15: ['temperature_2m'],
 *   models: ['ncep_hrrr_conus', 'gfs_seamless', 'ecmwf_ifs025'],
 *   timeformat: 'unixtime',
 * });
 * console.log(nyc?.hourly?.temperature_2m_ncep_hrrr_conus?.[0]);
 * ```
 */
export class OpenMeteo extends RESTler<OpenMeteoOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'OpenMeteo';

  readonly #hosts: Record<OpenMeteoApi, string>;

  /**
   * Creates a new Open-Meteo client.
   *
   * @param options - Client configuration. Everything is optional; without
   * `auth` the free, non-commercial hosts are used.
   * @throws {OpenMeteoError} `CONFIG_INVALID_API_KEY` when `auth` is given
   * without a non-empty `apiKey`; `CONFIG_INVALID_HOST` when a `hosts`
   * entry is not an https URL.
   */
  constructor(
    options: EventOptionKeys<OpenMeteoOptions, RESTlerEvents> = {},
  ) {
    const paid = options.auth !== undefined;
    const defaults = paid ? OPEN_METEO_CUSTOMER_HOSTS : OPEN_METEO_FREE_HOSTS;
    const hosts: Record<OpenMeteoApi, string> = { ...defaults };
    if (options.baseURL) hosts.forecast = options.baseURL;
    for (const [api, host] of Object.entries(options.hosts ?? {})) {
      if (!(api in PATHS)) continue;
      let url: URL | undefined;
      try {
        url = new URL(String(host));
      } catch {
        url = undefined;
      }
      if (
        !url ||
        !(url.protocol === 'https:' ||
          (url.protocol === 'http:' && isLocalHost(url)))
      ) {
        throw new OpenMeteoError('CONFIG_INVALID_HOST', { api });
      }
      hosts[api as OpenMeteoApi] = url.origin + url.pathname.replace(/\/$/, '');
    }
    const { hosts: _hosts, ...rest } = options;
    super({ ...rest, baseURL: hosts.forecast }, {
      baseURL: hosts.forecast,
      timeout: 30,
      contentType: 'JSON',
    });
    this.#hosts = hosts;
    this._responseHandler = (response) => this.__toError(response);
  }

  /** Whether a paid-plan API key is configured. The key itself is never readable. */
  get hasApiKey(): boolean {
    return this._hasOption('auth');
  }

  /** The host each API is called on. */
  get hosts(): Readonly<Record<OpenMeteoApi, string>> {
    return { ...this.#hosts };
  }

  /**
   * Weather forecast (Forecast API, `/v1/forecast`).
   *
   * @param query - Location(s), variables, models and range.
   * @returns One entry per location, in request order.
   * @throws {OpenMeteoError} `INVALID_REQUEST` (local validation),
   * `BAD_REQUEST` (an unknown variable or model, an out-of-range date),
   * `INVALID_API_KEY`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `TIMEOUT`,
   * `NETWORK_ERROR` or `RESPONSE_ERROR`.
   *
   * @example
   * ```ts
   * import { OpenMeteo } from '@tundraconnect/open-meteo';
   *
   * const client = new OpenMeteo();
   * const [chicago] = await client.forecast({
   *   latitude: 41.786,
   *   longitude: -87.752,
   *   hourly: ['temperature_2m', 'dew_point_2m'],
   *   daily: ['temperature_2m_max'],
   *   models: ['gfs_seamless'],
   *   temperatureUnit: 'fahrenheit',
   *   timezone: 'America/Chicago',
   * });
   * console.log(chicago?.daily?.temperature_2m_max);
   * ```
   */
  public async forecast(
    query: OpenMeteoQuery,
  ): Promise<OpenMeteoForecastSchema[]> {
    return await this.__call('forecast', query);
  }

  /**
   * Ensemble forecast (Ensemble API, `/v1/ensemble`): every member of every
   * requested ensemble model (`gfs_seamless` → 31 GEFS members,
   * `ecmwf_ifs025` → 51 ENS members, `icon_seamless`, `gem_global`, ...),
   * never just the mean. Use {@link columns} to split columns into
   * member and model.
   *
   * @param query - Location(s), variables, ensemble models and range.
   * @returns One entry per location, in request order.
   * @throws {OpenMeteoError} As {@link forecast}.
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
   *   models: ['gfs_seamless', 'ecmwf_ifs025'],
   * });
   * for (const c of columns(nyc!.hourly!, ['temperature_2m'])) {
   *   console.log(c.model, c.member, c.values[0]);
   * }
   * ```
   */
  public async ensemble(
    query: OpenMeteoQuery,
  ): Promise<OpenMeteoForecastSchema[]> {
    return await this.__call('ensemble', query);
  }

  /**
   * What earlier model runs forecast for each hour (Previous Runs API):
   * `temperature_2m_previous_day1` is the value forecast one day before,
   * `_previous_day2` two days before, and so on (up to 7, from Jan 2024).
   *
   * @param query - As {@link forecast}, plus `previousDays` to expand each
   * hourly/15-minutely variable into its previous-day columns.
   * @returns One entry per location, in request order.
   * @throws {OpenMeteoError} As {@link forecast}; `INVALID_REQUEST` for a
   * `previousDays` entry that isn't a positive integer.
   *
   * @example
   * ```ts
   * import { OpenMeteo } from '@tundraconnect/open-meteo';
   *
   * const client = new OpenMeteo();
   * const [nyc] = await client.previousRuns({
   *   latitude: 40.78,
   *   longitude: -73.97,
   *   hourly: ['temperature_2m'],
   *   previousDays: [1, 2, 3],
   *   models: ['gfs_seamless'],
   *   pastDays: 3,
   * });
   * console.log(nyc?.hourly?.temperature_2m_previous_day1);
   * ```
   */
  public async previousRuns(
    query: OpenMeteoPreviousRunsQuery,
  ): Promise<OpenMeteoForecastSchema[]> {
    const { previousDays, ...rest } = query;
    if (previousDays !== undefined) {
      if (
        !previousDays.every((d) => Number.isInteger(d) && d > 0)
      ) {
        throw new OpenMeteoError('INVALID_REQUEST', {
          reason: 'previousDays must be positive integers',
        });
      }
      const expand = (vars: readonly string[] | undefined) =>
        vars?.flatMap((v) =>
          /_previous_day\d+$/.test(v)
            ? [v]
            : [v, ...previousDays.map((d) => `${v}_previous_day${d}`)]
        );
      rest.hourly = expand(rest.hourly);
      rest.minutely15 = expand(rest.minutely15);
    }
    return await this.__call('previousRuns', rest);
  }

  /**
   * Archived forecasts stitched from each model's first forecast hours
   * (Historical Forecast API) — what the model said shortly before each
   * hour, back to 2021/2022 for most models.
   *
   * @param query - As {@link forecast}; usually with `startDate`/`endDate`.
   * @returns One entry per location, in request order.
   * @throws {OpenMeteoError} As {@link forecast}.
   *
   * @example
   * ```ts
   * import { OpenMeteo } from '@tundraconnect/open-meteo';
   *
   * const client = new OpenMeteo();
   * const [nyc] = await client.historicalForecast({
   *   latitude: 40.78,
   *   longitude: -73.97,
   *   hourly: ['temperature_2m'],
   *   models: ['ncep_hrrr_conus'],
   *   startDate: '2026-10-01',
   *   endDate: '2026-10-07',
   * });
   * console.log(nyc?.hourly?.time.length);
   * ```
   */
  public async historicalForecast(
    query: OpenMeteoQuery,
  ): Promise<OpenMeteoForecastSchema[]> {
    return await this.__call('historicalForecast', query);
  }

  /**
   * One specific model run, exactly as it was issued (Single Runs API) —
   * the forecast the model made at `run`, for backtesting against what
   * was knowable at the time.
   *
   * @param query - As {@link forecast}, plus the `run` initialisation time.
   * @returns One entry per location, in request order.
   * @throws {OpenMeteoError} As {@link forecast}; `INVALID_REQUEST` when
   * `run` isn't `YYYY-MM-DDTHH:MM`.
   *
   * @example
   * ```ts
   * import { OpenMeteo } from '@tundraconnect/open-meteo';
   *
   * const client = new OpenMeteo();
   * const [nyc] = await client.singleRun({
   *   latitude: 40.78,
   *   longitude: -73.97,
   *   hourly: ['temperature_2m'],
   *   models: ['gfs_global'],
   *   run: '2026-11-05T00:00',
   * });
   * console.log(nyc?.hourly?.temperature_2m?.[0]);
   * ```
   */
  public async singleRun(
    query: OpenMeteoSingleRunQuery,
  ): Promise<OpenMeteoForecastSchema[]> {
    if (typeof query.run !== 'string' || !MINUTE.test(query.run)) {
      throw new OpenMeteoError('INVALID_REQUEST', {
        reason: 'run must be YYYY-MM-DDTHH:MM',
      });
    }
    return await this.__call('singleRuns', query);
  }

  /**
   * Historical weather from reanalysis (Historical Weather API,
   * `/v1/archive`): ERA5, ERA5-Land, ECMWF IFS and others, from 1940.
   *
   * @param query - As {@link forecast}, with a required date range.
   * @returns One entry per location, in request order.
   * @throws {OpenMeteoError} As {@link forecast}; `INVALID_REQUEST` when
   * `startDate`/`endDate` is missing or not `YYYY-MM-DD`.
   *
   * @example
   * ```ts
   * import { OpenMeteo } from '@tundraconnect/open-meteo';
   *
   * const client = new OpenMeteo();
   * const [nyc] = await client.archive({
   *   latitude: 40.78,
   *   longitude: -73.97,
   *   daily: ['temperature_2m_max'],
   *   startDate: '2025-07-01',
   *   endDate: '2025-07-31',
   *   timezone: 'America/New_York',
   * });
   * console.log(nyc?.daily?.temperature_2m_max);
   * ```
   */
  public async archive(
    query: OpenMeteoArchiveQuery,
  ): Promise<OpenMeteoForecastSchema[]> {
    if (
      !DAY.test(String(query.startDate)) || !DAY.test(String(query.endDate))
    ) {
      throw new OpenMeteoError('INVALID_REQUEST', {
        reason: 'startDate and endDate (YYYY-MM-DD) are required',
      });
    }
    return await this.__call('archive', query);
  }

  /**
   * Adds the paid-plan `apikey` query parameter. Chains to `super()` first
   * so RESTler's auth-config validation still runs.
   *
   * @param request - The request object to modify
   * @protected
   */
  protected override _authInjector(
    request: RESTlerEndpoint,
  ): void | Promise<void> {
    const auth = (request.auth ?? this._getOption('auth')) as
      | OpenMeteoAuth
      | undefined;
    if (!auth) return;
    super._authInjector(request);
    request.query ??= {};
    request.query['apikey'] = auth.apiKey;
  }

  /**
   * Validates `auth`: when present it must be `{ type: 'CUSTOM', apiKey }`.
   *
   * @param key - The option key to process
   * @param value - The option value to process
   * @returns The processed option value
   * @throws {OpenMeteoError} `CONFIG_INVALID_API_KEY`
   * @protected
   */
  protected override _processOption<K extends keyof OpenMeteoOptions>(
    key: K,
    value: OpenMeteoOptions[K],
  ): OpenMeteoOptions[K] {
    if (key === 'auth' && value !== undefined) {
      const auth = value as unknown as OpenMeteoAuth;
      if (
        !auth || auth.type !== 'CUSTOM' || typeof auth.apiKey !== 'string' ||
        auth.apiKey.trim() === ''
      ) {
        // Never echo the key: an error's context is serialised verbatim.
        throw new OpenMeteoError('CONFIG_INVALID_API_KEY', {});
      }
      value = {
        type: 'CUSTOM',
        apiKey: auth.apiKey.trim(),
      } as OpenMeteoOptions[K];
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /** Builds the query, calls `api` and normalises the answer to an array. */
  private async __call(
    api: OpenMeteoApi,
    query: OpenMeteoQuery & { run?: string },
  ): Promise<OpenMeteoForecastSchema[]> {
    const body = await this.__requestAndValidate(
      {
        baseURL: this.#hosts[api],
        path: PATHS[api],
        method: 'GET',
        query: this.__query(query),
      },
      Guardian.oneOf([
        Guardian.array(OpenMeteoForecastSchemaObject),
        OpenMeteoForecastSchemaObject,
      ], 'expected one location object or an array of them') as BaseGuardian<
        OpenMeteoForecastSchema[] | OpenMeteoForecastSchema
      >,
    );
    return Array.isArray(body) ? body : [body];
  }

  /**
   * Serialises a query to Open-Meteo's parameter names.
   *
   * @throws {OpenMeteoError} `INVALID_REQUEST` for missing/mismatched
   * coordinates or a malformed date.
   */
  private __query(
    query: OpenMeteoQuery & { run?: string },
  ): Record<string, string> {
    const list = (v: number | readonly number[] | undefined) =>
      v === undefined ? undefined : Array.isArray(v) ? [...v] : [v as number];
    const lat = list(query.latitude);
    const lon = list(query.longitude);
    const elev = list(query.elevation);
    const finite = (xs: number[]) =>
      xs.length > 0 && xs.every((x) => typeof x === 'number' && isFinite(x));
    if (!lat || !lon || !finite(lat) || !finite(lon)) {
      throw new OpenMeteoError('INVALID_REQUEST', {
        reason: 'latitude and longitude must be finite numbers',
      });
    }
    if (lat.length !== lon.length || (elev && elev.length !== lat.length)) {
      throw new OpenMeteoError('INVALID_REQUEST', {
        reason: 'latitude, longitude and elevation need one value per location',
      });
    }
    for (const k of ['startDate', 'endDate'] as const) {
      const v = query[k];
      if (v !== undefined && !DAY.test(v)) {
        throw new OpenMeteoError('INVALID_REQUEST', {
          reason: `${k} must be YYYY-MM-DD`,
        });
      }
    }
    for (
      const k of [
        'startHour',
        'endHour',
        'startMinutely15',
        'endMinutely15',
      ] as const
    ) {
      const v = query[k];
      if (v !== undefined && !MINUTE.test(v)) {
        throw new OpenMeteoError('INVALID_REQUEST', {
          reason: `${k} must be YYYY-MM-DDTHH:MM`,
        });
      }
    }

    const out: Record<string, string> = {
      latitude: lat.join(','),
      longitude: lon.join(','),
    };
    if (elev) out['elevation'] = elev.join(',');
    const q = query as Record<string, unknown>;
    for (const [key, param] of Object.entries(LISTS)) {
      const v = q[key] as readonly string[] | undefined;
      if (v !== undefined && v.length > 0) out[param] = v.join(',');
    }
    for (const [key, param] of Object.entries(SCALARS)) {
      const v = q[key];
      if (v !== undefined) out[param] = String(v);
    }
    for (const [param, v] of Object.entries(query.params ?? {})) {
      if (v === undefined) continue;
      out[param] = Array.isArray(v) ? v.join(',') : String(v);
    }
    return out;
  }

  /**
   * Every request funnels through here, so a transport failure surfaces as
   * this connect's own error on every path: a timeout as `TIMEOUT`, a
   * failure before any response as `NETWORK_ERROR`, and an exhausted
   * RESTler rate-limit retry (`maxRetryWait`) as `RATE_LIMITED` — all
   * `transient`. An {@link OpenMeteoError} from the response handler passes
   * through unchanged.
   */
  protected override async _makeRequest<H = ResponseBody, B = H>(
    endpoint: RESTlerEndpoint,
    options: RESTlerRequestOptions<H, B> = {},
  ): Promise<RESTlerResponse<B>> {
    try {
      return await super._makeRequest<H, B>(endpoint, options);
    } catch (err) {
      throw this.__transportError(err, endpoint.timeout);
    }
  }

  /** `err` rewrapped as this connect's transient code, or returned unchanged. */
  private __transportError(err: unknown, timeout: number | undefined): unknown {
    if (err instanceof RESTlerRateLimitError) {
      return new OpenMeteoError('RATE_LIMITED', {
        status: 429,
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new OpenMeteoError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new OpenMeteoError('NETWORK_ERROR', {}, err);
    }
    return err;
  }

  /**
   * Makes a request and validates its body against `guard`, rewrapping
   * RESTler's {@link RESTlerResponseValidationError} as `RESPONSE_ERROR`.
   *
   * @throws {OpenMeteoError} `RESPONSE_ERROR` when the body fails validation
   * @private
   */
  private async __requestAndValidate<B>(
    endpoint: RESTlerEndpoint,
    guard: BaseGuardian<B>,
  ): Promise<B> {
    try {
      const resp = await this._makeRequest(endpoint, {
        responseSchema: (data) => guard.parse(data),
      });
      return resp.body as B;
    } catch (err) {
      if (err instanceof RESTlerResponseValidationError) {
        throw new OpenMeteoError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler: passes a success body through and maps
   * an error status to an {@link OpenMeteoError}. Open-Meteo's `reason` is
   * free text, so the code comes from the status — except the API-key
   * refusal, which shares 400 with every other bad request.
   *
   * @throws {OpenMeteoError} `INVALID_API_KEY`, `BAD_REQUEST`, `NOT_FOUND`,
   * `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or `UNKNOWN_ERROR`.
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body;
    const [, body] = OpenMeteoErrorBodySchemaObject.safeParse(response.body);
    const reason = body?.reason;
    let code: OpenMeteoErrorCode;
    if (status === 429) code = 'RATE_LIMITED';
    else if (
      status === 401 || status === 403 || /api key/i.test(reason ?? '')
    ) {
      code = 'INVALID_API_KEY';
    } else if (status === 400) code = 'BAD_REQUEST';
    else if (status === 404) code = 'NOT_FOUND';
    else code = status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN_ERROR';
    throw new OpenMeteoError(code, {
      status,
      reason,
      retryAfterSeconds: this._parseRetryAfter(response.headers),
      body: response.body,
    });
  }
}
