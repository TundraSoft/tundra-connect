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
  AviationWeatherErrorBodySchemaObject,
  type AviationWeatherMetarSchema,
  AviationWeatherMetarSchemaObject,
  type AviationWeatherTafSchema,
  AviationWeatherTafSchemaObject,
} from './schema/mod.ts';
import {
  AviationWeatherError,
  type AviationWeatherErrorCode,
} from './errors/mod.ts';
import {
  type MetarRemarkTemperatures,
  parseRemarkTemperatures,
} from './remarks.ts';
import { parseCsv } from './csv.ts';

/** A sliding-window request budget. */
export type AviationWeatherRateLimit = {
  /** Requests allowed per window. */
  requests: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

/** The service's published limit: 100 requests per minute. */
export const AVIATIONWEATHER_RATE_LIMIT: Readonly<AviationWeatherRateLimit> = {
  requests: 100,
  windowMs: 60_000,
};

/** Options for configuring an {@link AviationWeather} client. No credentials: the API is open. */
export type AviationWeatherOptions = Omit<RESTlerOptions, 'auth'> & {
  /**
   * Client-side request budget. Every request waits for a slot, so one
   * client never exceeds it; aviationweather.gov blocks clients that go
   * over 100 requests per minute. `false` turns it off (when you budget
   * across several clients yourself).
   * @default AVIATIONWEATHER_RATE_LIMIT
   */
  rateLimit?: AviationWeatherRateLimit | false;
  /**
   * `User-Agent` sent with every request. The service asks for a custom
   * one so automated filtering doesn't block valid traffic. Browsers
   * ignore it (and the API sends no CORS headers, so browsers can't call
   * it at all).
   * @default '@tundraconnect/aviationweather'
   */
  userAgent?: string;
};

/** A latitude/longitude box: `[minLat, minLon, maxLat, maxLon]`. */
export type AviationWeatherBoundingBox = readonly [
  number,
  number,
  number,
  number,
];

/** Query for {@link AviationWeather.getMetars}. */
export type AviationWeatherMetarQuery = {
  /**
   * ICAO station id(s) — `KNYC`, `['KNYC', 'KLGA']` — or a selector the
   * API accepts (`@NY` for a state). Required unless `bbox` is given.
   */
  ids?: string | readonly string[];
  /** Stations inside this box instead of (or as well as) `ids`. */
  bbox?: AviationWeatherBoundingBox;
  /** Hours back from `date` (or now) to include. Every report in range is returned, METAR and SPECI. */
  hours?: number;
  /** End of the range — a `Date` or an ISO 8601 string. Defaults to now. The database keeps 30 days. */
  date?: Date | string;
};

/** Query for {@link AviationWeather.getTafs}. */
export type AviationWeatherTafQuery = {
  /** ICAO station id(s) or a selector. Required unless `bbox` is given. */
  ids?: string | readonly string[];
  /** Stations inside this box. */
  bbox?: AviationWeatherBoundingBox;
  /** Reference time — a `Date` or an ISO 8601 string. Defaults to now. */
  date?: Date | string;
  /** Whether `date` selects TAFs `valid` at that time (default) or `issue`d then. */
  time?: 'valid' | 'issue';
};

/** A METAR/SPECI with its remark temperatures read from the raw text. */
export type AviationWeatherMetar = AviationWeatherMetarSchema & {
  /** The remarks' T-group and 6/24-hour extremes, to 0.1 °C. See {@link parseRemarkTemperatures}. */
  remarkTemperatures: MetarRemarkTemperatures;
};

/**
 * One row of the bulk METAR cache file. Every column keeps its exact text
 * (empty string when blank); columns the file repeats (`sky_cover`,
 * `cloud_base_ft_agl`, one per layer) become arrays in file order.
 */
export type AviationWeatherMetarCacheRow = Record<string, string | string[]> & {
  /** The report exactly as issued. */
  raw_text: string;
  /** ICAO station id. */
  station_id: string;
  /** Observation time (ISO 8601). */
  observation_time: string;
  /** Remark temperatures read from `raw_text`. */
  remarkTemperatures: MetarRemarkTemperatures;
};

/** Result of {@link AviationWeather.getMetarCache}. */
export type AviationWeatherMetarCache = {
  /** The file's column names, in order (duplicates included). */
  header: string[];
  /** One row per report, in file order. */
  rows: AviationWeatherMetarCacheRow[];
  /** The file's `Last-Modified` header — when it was last rebuilt (about once a minute). */
  lastModified?: string;
};

const METAR_CACHE_PATH = '/data/cache/metars.cache.csv.gz';

/**
 * aviationweather.gov Data API client: METAR (including SPECI) and TAF
 * reports by station and time range, plus the bulk METAR cache.
 *
 * Every report keeps its raw text next to the decoded fields, and each
 * METAR gains `remarkTemperatures` — the T-group's tenths-of-a-degree
 * temperature and dewpoint and the 6/24-hour extremes — read from that
 * raw text. Polymarket settles temperature markets on these station
 * observations, so the precision matters. Nothing is rounded or merged.
 *
 * Requests are paced to the service's limit of 100 per minute.
 *
 * @example
 * ```ts
 * import { AviationWeather } from '@tundraconnect/aviationweather';
 *
 * const awc = new AviationWeather({ userAgent: 'my-recorder/1.0' });
 * const reports = await awc.getMetars({ ids: ['KNYC', 'KLGA'], hours: 3 });
 * for (const r of reports) {
 *   console.log(r.icaoId, r.metarType, r.remarkTemperatures.hourly?.temperatureC);
 * }
 * ```
 */
export class AviationWeather extends RESTler<AviationWeatherOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'AviationWeather';

  readonly #rateLimit: AviationWeatherRateLimit | false;
  readonly #userAgent: string;
  #slots: number[] = [];
  #gate: Promise<void> = Promise.resolve();

  /**
   * Creates a new aviationweather.gov client.
   *
   * @param options - Client configuration; everything is optional.
   * @throws {AviationWeatherError} `CONFIG_INVALID_RATE_LIMIT` for a
   * `rateLimit` that isn't `false` or positive integers.
   */
  constructor(
    options: EventOptionKeys<AviationWeatherOptions, RESTlerEvents> = {},
  ) {
    const { rateLimit, userAgent, ...rest } = options;
    const limit = rateLimit === undefined
      ? { ...AVIATIONWEATHER_RATE_LIMIT }
      : rateLimit;
    if (
      limit !== false &&
      (typeof limit !== 'object' || limit === null ||
        !Number.isInteger(limit.requests) || limit.requests < 1 ||
        !Number.isInteger(limit.windowMs) || limit.windowMs < 1)
    ) {
      throw new AviationWeatherError('CONFIG_INVALID_RATE_LIMIT', {});
    }
    super(rest, {
      baseURL: 'https://aviationweather.gov',
      timeout: 30,
      contentType: 'JSON',
    });
    this.#rateLimit = limit;
    this.#userAgent = userAgent ?? '@tundraconnect/aviationweather';
    this._responseHandler = (response) => this.__toError(response);
  }

  /** The client-side request budget, or `false` when off. */
  get rateLimit(): Readonly<AviationWeatherRateLimit> | false {
    return this.#rateLimit === false ? false : { ...this.#rateLimit };
  }

  /**
   * METAR and SPECI reports (`/api/data/metar`), newest first per station
   * as the service orders them. A station with nothing in range yields no
   * rows (the service's `204`), not an error. At most 400 reports come
   * back per call; use {@link getMetarCache} for many stations.
   *
   * @param query - Station id(s) and/or a box, and the time range.
   * @returns Every report in range, each with `remarkTemperatures`.
   * @throws {AviationWeatherError} `INVALID_REQUEST` (no `ids`/`bbox`, a
   * bad `hours`/`date`), `BAD_REQUEST`, `FORBIDDEN`, `RATE_LIMITED`,
   * `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or `RESPONSE_ERROR`.
   *
   * @example
   * ```ts
   * import { AviationWeather } from '@tundraconnect/aviationweather';
   *
   * const awc = new AviationWeather();
   * const [latest] = await awc.getMetars({ ids: 'KNYC' });
   * console.log(latest?.rawOb, latest?.remarkTemperatures.hourly);
   * ```
   */
  public async getMetars(
    query: AviationWeatherMetarQuery,
  ): Promise<AviationWeatherMetar[]> {
    const q = this.__stationQuery(query);
    if (query.hours !== undefined) {
      if (!(typeof query.hours === 'number' && query.hours > 0)) {
        throw new AviationWeatherError('INVALID_REQUEST', {
          reason: 'hours must be a positive number',
        });
      }
      q['hours'] = String(query.hours);
    }
    const metars = await this.__requestAndValidate(
      { path: '/api/data/metar', method: 'GET', query: q },
      Guardian.preprocess(
        (v: unknown) => v ?? [],
        Guardian.array(AviationWeatherMetarSchemaObject),
      ) as BaseGuardian<AviationWeatherMetarSchema[]>,
    );
    return metars.map((m) => ({
      ...m,
      remarkTemperatures: parseRemarkTemperatures(m.rawOb),
    }));
  }

  /**
   * TAFs (`/api/data/taf`) with their raw text and decoded periods.
   *
   * @param query - Station id(s) and/or a box, and the reference time.
   * @returns Every matching TAF; none when the service has nothing (`204`).
   * @throws {AviationWeatherError} As {@link getMetars}.
   *
   * @example
   * ```ts
   * import { AviationWeather } from '@tundraconnect/aviationweather';
   *
   * const awc = new AviationWeather();
   * const [taf] = await awc.getTafs({ ids: 'KLGA' });
   * console.log(taf?.rawTAF, taf?.fcsts.length);
   * ```
   */
  public async getTafs(
    query: AviationWeatherTafQuery,
  ): Promise<AviationWeatherTafSchema[]> {
    const q = this.__stationQuery(query);
    if (query.time !== undefined) {
      if (query.time !== 'valid' && query.time !== 'issue') {
        throw new AviationWeatherError('INVALID_REQUEST', {
          reason: "time must be 'valid' or 'issue'",
        });
      }
      q['time'] = query.time;
    }
    return await this.__requestAndValidate(
      { path: '/api/data/taf', method: 'GET', query: q },
      Guardian.preprocess(
        (v: unknown) => v ?? [],
        Guardian.array(AviationWeatherTafSchemaObject),
      ) as BaseGuardian<AviationWeatherTafSchema[]>,
    );
  }

  /**
   * The bulk METAR cache (`/data/cache/metars.cache.csv.gz`): every current
   * report worldwide in one gzipped CSV, rebuilt about once a minute. This
   * is the service's recommended way to watch many stations at once — one
   * request instead of one per station.
   *
   * Values stay exactly as written (strings); nothing is converted or
   * rounded. Needs the standard `DecompressionStream`.
   *
   * @param options.stations - Keep only these station ids (case-insensitive).
   * @returns The header, the rows and the file's `Last-Modified`.
   * @throws {AviationWeatherError} `RESPONSE_ERROR` when the file isn't the
   * expected CSV, plus the transport/status codes of {@link getMetars}.
   *
   * @example
   * ```ts
   * import { AviationWeather } from '@tundraconnect/aviationweather';
   *
   * const awc = new AviationWeather();
   * const cache = await awc.getMetarCache({ stations: ['KNYC', 'KMDW'] });
   * for (const row of cache.rows) {
   *   console.log(row.station_id, row.temp_c, row.remarkTemperatures.hourly?.temperatureC);
   * }
   * ```
   */
  public async getMetarCache(
    options: { stations?: readonly string[] } = {},
  ): Promise<AviationWeatherMetarCache> {
    const resp = await this._makeRequest<ArrayBuffer>({
      path: METAR_CACHE_PATH,
      method: 'GET',
      responseType: 'ARRAY_BUFFER',
    });
    let text: string;
    try {
      text = await gunzipText(resp.body as ArrayBuffer);
    } catch (cause) {
      throw new AviationWeatherError('RESPONSE_ERROR', {
        reason: 'the cache file could not be decompressed',
      }, cause instanceof Error ? cause : undefined);
    }
    const lines = parseCsv(text);
    // Older cache files open with a few status lines before the header.
    const start = lines.findIndex((r) => r[0] === 'raw_text');
    if (start === -1) {
      throw new AviationWeatherError('RESPONSE_ERROR', {
        reason: 'the cache file has no raw_text header',
      });
    }
    const header = lines[start]!;
    const repeated = new Set(
      header.filter((h, i) => header.indexOf(h) !== i),
    );
    const wanted = options.stations
      ? new Set(options.stations.map((s) => s.toUpperCase()))
      : undefined;
    const rows: AviationWeatherMetarCacheRow[] = [];
    for (const fields of lines.slice(start + 1)) {
      if (fields.length === 1 && fields[0] === '') continue;
      const row: Record<string, string | string[]> = {};
      header.forEach((name, i) => {
        const value = fields[i] ?? '';
        if (repeated.has(name)) {
          ((row[name] ??= []) as string[]).push(value);
        } else row[name] = value;
      });
      const station = String(row['station_id'] ?? '');
      if (wanted && !wanted.has(station.toUpperCase())) continue;
      const raw = String(row['raw_text'] ?? '');
      rows.push({
        ...row,
        raw_text: raw,
        station_id: station,
        observation_time: String(row['observation_time'] ?? ''),
        remarkTemperatures: parseRemarkTemperatures(raw),
      } as AviationWeatherMetarCacheRow);
    }
    const lastModified = resp.headers?.['last-modified'];
    return { header, rows, ...(lastModified && { lastModified }) };
  }

  /** Clock for the rate limiter. Overridable in tests. */
  protected _now(): number {
    return Date.now();
  }

  /** Waits for a request slot in the sliding window. Calls are served in order. */
  async #acquire(): Promise<void> {
    const limit = this.#rateLimit;
    if (limit === false) return;
    const turn = this.#gate.then(async () => {
      for (;;) {
        const now = this._now();
        while (
          this.#slots.length > 0 && now - this.#slots[0]! >= limit.windowMs
        ) {
          this.#slots.shift();
        }
        if (this.#slots.length < limit.requests) {
          this.#slots.push(now);
          return;
        }
        await this._sleep(this.#slots[0]! + limit.windowMs - now);
      }
    });
    this.#gate = turn.catch(() => {});
    await turn;
  }

  /** Builds the shared `ids`/`bbox`/`date` part of a query. */
  private __stationQuery(
    query: { ids?: string | readonly string[]; bbox?: unknown; date?: unknown },
  ): Record<string, string> {
    const q: Record<string, string> = { format: 'json' };
    const ids = typeof query.ids === 'string'
      ? [query.ids]
      : Array.isArray(query.ids)
      ? [...query.ids]
      : [];
    const cleaned = ids.map((s) => String(s).trim()).filter((s) => s !== '');
    if (cleaned.length > 0) q['ids'] = cleaned.join(',');
    if (query.bbox !== undefined) {
      const box = query.bbox as unknown[];
      if (
        !Array.isArray(box) || box.length !== 4 ||
        !box.every((n) => typeof n === 'number' && isFinite(n))
      ) {
        throw new AviationWeatherError('INVALID_REQUEST', {
          reason: 'bbox must be [minLat, minLon, maxLat, maxLon]',
        });
      }
      q['bbox'] = box.join(',');
    }
    if (!q['ids'] && !q['bbox']) {
      throw new AviationWeatherError('INVALID_REQUEST', {
        reason: 'ids or bbox is required',
      });
    }
    if (query.date !== undefined) {
      const d = query.date instanceof Date
        ? query.date
        : new Date(String(query.date));
      if (isNaN(d.getTime())) {
        throw new AviationWeatherError('INVALID_REQUEST', {
          reason: 'date must be a Date or an ISO 8601 string',
        });
      }
      q['date'] = d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
    return q;
  }

  /**
   * Every request funnels through here: it waits for a rate-limit slot,
   * sets the `User-Agent`, and rewraps a transport failure as this
   * connect's error — `TIMEOUT`, `NETWORK_ERROR`, or `RATE_LIMITED` for an
   * exhausted RESTler retry (`maxRetryWait`); all `transient`.
   */
  protected override async _makeRequest<H = ResponseBody, B = H>(
    endpoint: RESTlerEndpoint,
    options: RESTlerRequestOptions<H, B> = {},
  ): Promise<RESTlerResponse<B>> {
    await this.#acquire();
    try {
      return await super._makeRequest<H, B>({
        ...endpoint,
        headers: { 'User-Agent': this.#userAgent, ...endpoint.headers },
      }, options);
    } catch (err) {
      throw this.__transportError(err, endpoint.timeout);
    }
  }

  /** `err` rewrapped as this connect's transient code, or returned unchanged. */
  private __transportError(err: unknown, timeout: number | undefined): unknown {
    if (err instanceof RESTlerRateLimitError) {
      return new AviationWeatherError('RATE_LIMITED', {
        status: 429,
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new AviationWeatherError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new AviationWeatherError('NETWORK_ERROR', {}, err);
    }
    return err;
  }

  /**
   * Makes a request and validates its body against `guard`, rewrapping a
   * validation failure as `RESPONSE_ERROR`.
   *
   * @throws {AviationWeatherError} `RESPONSE_ERROR`
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
        throw new AviationWeatherError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler: passes a success body through (a `204`
   * has none) and maps an error status to an {@link AviationWeatherError}.
   *
   * @throws {AviationWeatherError} `BAD_REQUEST`, `FORBIDDEN`, `NOT_FOUND`,
   * `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or `UNKNOWN_ERROR`.
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body;
    const [, body] = AviationWeatherErrorBodySchemaObject.safeParse(
      response.body,
    );
    const codes: Record<number, AviationWeatherErrorCode> = {
      400: 'BAD_REQUEST',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      429: 'RATE_LIMITED',
    };
    const code = codes[status] ??
      (status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN_ERROR');
    throw new AviationWeatherError(code, {
      status,
      reason: body?.error,
      retryAfterSeconds: this._parseRetryAfter(response.headers),
      body: response.body,
    });
  }
}

/** Decompresses a gzip body (or decodes it as-is when it isn't gzip). */
async function gunzipText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return new TextDecoder().decode(bytes);
  }
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  void writer.write(bytes).then(() => writer.close()).catch(() => {});
  const reader = stream.readable.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
