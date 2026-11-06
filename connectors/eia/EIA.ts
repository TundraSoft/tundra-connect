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
import type { BaseGuardian, GuardianError } from '@guardian';
import {
  type EIADataResponseSchema,
  EIADataResponseSchemaObject,
  EIAErrorBodySchemaObject,
  type EIAFacetValuesSchema,
  EIAFacetValuesSchemaObject,
  type EIARouteSchema,
  EIARouteSchemaObject,
  type EIARowSchema,
  type EIAWarningSchema,
} from './schema/mod.ts';
import { EIAError, type EIAErrorCode } from './errors/mod.ts';

/** EIA API key, sent as the `api_key` query parameter. Free from eia.gov/opendata. */
export type EIAAuth = {
  type: 'CUSTOM';
  /** Your EIA Open Data API key. */
  apiKey: string;
};

/** Options for configuring an {@link EIA} client. */
export type EIAOptions = Omit<RESTlerOptions, 'auth'> & {
  /** EIA API key, as `{ type: 'CUSTOM', apiKey }`. Required. */
  auth: EIAAuth;
};

/** EIA's cap on rows per JSON response. */
export const EIA_MAX_PAGE_SIZE = 5000;

/** One sort key. */
export type EIASort = { column: string; direction?: 'asc' | 'desc' };

/** Query for a v2 data route. */
export type EIADataQuery = {
  /** `daily`, `weekly`, `monthly`, `annual`, ... (see the route's metadata). */
  frequency?: string;
  /** Data columns to return, e.g. `['value']`. */
  data?: readonly string[];
  /** Facet filters: `{ series: ['RWTC', 'RBRTE'] }`. */
  facets?: Record<string, readonly string[]>;
  /** First period (inclusive), in the route's period format. */
  start?: string;
  /** Last period (inclusive). */
  end?: string;
  /** Sort keys, applied in order. Paging is only stable with a sort. */
  sort?: readonly EIASort[];
  /** Rows to skip. */
  offset?: number;
  /** Rows to return, at most {@link EIA_MAX_PAGE_SIZE}. */
  length?: number;
};

/** Options for {@link EIA.paginate} and {@link EIA.getAllData}. */
export type EIAPaginateOptions = {
  /** Rows per request, 1–5000. @default 5000 */
  pageSize?: number;
  /** Stop after this many rows. */
  maxRows?: number;
};

/** One fetched page, as {@link EIA.paginate} yields it. */
export type EIAPage = EIADataResponseSchema & {
  /** Offset this page was requested at. */
  offset: number;
};

/** Metadata of one page in {@link EIAAllData}. */
export type EIAPageInfo = {
  offset: number;
  rows: number;
  /** `total` as EIA reported it for this page. It can change between pages when EIA revises data mid-read. */
  total: string | number;
  warnings?: EIAWarningSchema[];
  request: EIADataResponseSchema['request'];
  apiVersion: string;
};

/** Result of {@link EIA.getAllData}: every row, plus each page's metadata. */
export type EIAAllData = {
  /** Every row in EIA's order, untouched. */
  rows: EIARowSchema[];
  /** One entry per request made. */
  pages: EIAPageInfo[];
  /** `dateFormat` of the first page. */
  dateFormat?: string;
  /** `frequency` of the first page. */
  frequency?: string;
};

/** Petroleum spot-price series ids (route `petroleum/pri/spt`). */
export const EIA_SPOT_SERIES = {
  /** Cushing, OK WTI spot price FOB, $/bbl. */
  WTI: 'RWTC',
  /** Europe Brent spot price FOB, $/bbl. */
  BRENT: 'RBRTE',
} as const;

/**
 * Headline Weekly Petroleum Status Report stock series (route
 * `petroleum/stoc/wstk`), thousand barrels. Any other series in the route
 * can be passed by id.
 */
export const EIA_WPSR_STOCK_SERIES = {
  /** U.S. ending stocks of crude oil excluding SPR. */
  CRUDE_EXCL_SPR: 'WCESTUS1',
  /** U.S. crude oil in the Strategic Petroleum Reserve. */
  SPR: 'WCSSTUS1',
  /** U.S. ending stocks of total gasoline. */
  GASOLINE: 'WGTSTUS1',
  /** U.S. ending stocks of distillate fuel oil. */
  DISTILLATE: 'WDISTUS1',
  /** U.S. ending stocks of kerosene-type jet fuel. */
  JET_FUEL: 'WKJSTUS1',
  /** U.S. ending stocks of crude oil and petroleum products excluding SPR. */
  TOTAL_EXCL_SPR: 'WTESTUS1',
  /** Cushing, OK ending stocks of crude oil excluding SPR. */
  CUSHING: 'W_EPC0_SAX_YCUOK_MBBL',
} as const;

/** Query for {@link EIA.getSpotPrices}. */
export type EIASpotPriceQuery = {
  /** Series ids. @default [RWTC, RBRTE] (WTI and Brent) */
  series?: readonly string[];
  /** @default 'daily' */
  frequency?: 'daily' | 'weekly' | 'monthly' | 'annual';
  start?: string;
  end?: string;
};

/** Query for {@link EIA.getWeeklyStocks}. */
export type EIAWeeklyStocksQuery = {
  /** Series ids. @default every value of {@link EIA_WPSR_STOCK_SERIES} */
  series?: readonly string[];
  start?: string;
  end?: string;
};

const ROUTE = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/i;

/**
 * U.S. Energy Information Administration Open Data API (v2) client.
 *
 * Covers the whole route/facet model generically — {@link getRoute},
 * {@link getFacetValues}, {@link getData}, {@link paginate} past the
 * 5,000-row cap — with typed helpers for WTI/Brent spot prices and the
 * Weekly Petroleum Status Report stocks.
 *
 * EIA revises published data, so nothing is collapsed: every row keeps
 * its `period` and EIA's own value string, and every page keeps its
 * `total`, warnings and request echo.
 *
 * @example
 * ```ts
 * import { EIA } from '@tundraconnect/eia';
 *
 * const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });
 * const { rows } = await eia.getSpotPrices({ start: '2026-10-01' });
 * for (const r of rows) console.log(r.period, r.series, r.value);
 * ```
 */
export class EIA extends RESTler<EIAOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'EIA';

  /**
   * Creates a new EIA client.
   *
   * @param options - Client configuration; `auth` is required.
   * @throws {EIAError} `CONFIG_INVALID_API_KEY` when `auth` is missing or
   * its `apiKey` is empty.
   */
  constructor(options: EventOptionKeys<EIAOptions, RESTlerEvents>) {
    super(options, {
      baseURL: 'https://api.eia.gov',
      timeout: 60,
      contentType: 'JSON',
    });
    if (!this._hasOption('auth')) {
      throw new EIAError('CONFIG_INVALID_API_KEY', {});
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /** Always `true` once constructed; the key itself is never readable. */
  get hasApiKey(): boolean {
    return this._hasOption('auth');
  }

  /**
   * Route metadata (`/v2/<route>/`): child routes for a branch; for a data
   * route its frequencies, facets, columns and `startPeriod`/`endPeriod`
   * (the latest period released).
   *
   * @param route - e.g. `petroleum`, `petroleum/pri/spt`. Empty for the root.
   * @throws {EIAError} `INVALID_REQUEST`, `NOT_FOUND`, `INVALID_API_KEY`,
   * `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or
   * `RESPONSE_ERROR`.
   *
   * @example
   * ```ts
   * import { EIA } from '@tundraconnect/eia';
   *
   * const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });
   * const meta = await eia.getRoute('petroleum/stoc/wstk');
   * console.log(meta.response.endPeriod);
   * ```
   */
  public async getRoute(route = ''): Promise<EIARouteSchema> {
    return await this.__requestAndValidate(
      { path: this.__path(route), method: 'GET' },
      EIARouteSchemaObject,
    );
  }

  /**
   * Every value of one facet (`/v2/<route>/facet/<facet>/`), e.g. every
   * series id of a route.
   *
   * @throws {EIAError} As {@link getRoute}.
   *
   * @example
   * ```ts
   * import { EIA } from '@tundraconnect/eia';
   *
   * const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });
   * const series = await eia.getFacetValues('petroleum/pri/spt', 'series');
   * console.log(series.response.facets.map((f) => `${f.id}: ${f.name}`));
   * ```
   */
  public async getFacetValues(
    route: string,
    facet: string,
  ): Promise<EIAFacetValuesSchema> {
    if (!/^[a-z0-9-]+$/i.test(facet)) {
      throw new EIAError('INVALID_REQUEST', { reason: 'invalid facet id' });
    }
    return await this.__requestAndValidate(
      { path: `${this.__path(route)}facet/${facet}/`, method: 'GET' },
      EIAFacetValuesSchemaObject,
    );
  }

  /**
   * One page of rows (`/v2/<route>/data/`). EIA returns at most 5,000
   * rows per call; see {@link paginate} / {@link getAllData} for more.
   *
   * @throws {EIAError} `INVALID_REQUEST` for an out-of-range `length` or
   * `offset`, `BAD_REQUEST` (an unknown facet or frequency), plus the
   * codes of {@link getRoute}.
   *
   * @example
   * ```ts
   * import { EIA } from '@tundraconnect/eia';
   *
   * const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });
   * const page = await eia.getData('petroleum/pri/spt', {
   *   frequency: 'daily',
   *   data: ['value'],
   *   facets: { series: ['RWTC'] },
   *   sort: [{ column: 'period', direction: 'desc' }],
   *   length: 5,
   * });
   * console.log(page.response.total, page.response.data);
   * ```
   */
  public async getData(
    route: string,
    query: EIADataQuery = {},
  ): Promise<EIADataResponseSchema> {
    return await this.__requestAndValidate(
      {
        path: `${this.__path(route)}data/`,
        method: 'GET',
        query: this.__dataQuery(query),
      },
      EIADataResponseSchemaObject,
    );
  }

  /**
   * Every page of a data query, one request at a time, from `query.offset`
   * (default 0) until EIA's `total` is reached or a page comes back short.
   * Each yielded page is EIA's full response plus the `offset` it was
   * requested at.
   *
   * Give `sort` a column that orders rows uniquely (e.g. `period` then
   * `series`) for stable paging; EIA can revise data between requests.
   *
   * @throws {EIAError} As {@link getData}.
   *
   * @example
   * ```ts
   * import { EIA } from '@tundraconnect/eia';
   *
   * const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });
   * for await (const page of eia.paginate('petroleum/stoc/wstk', {
   *   frequency: 'weekly',
   *   data: ['value'],
   *   sort: [{ column: 'period' }, { column: 'series' }],
   * })) {
   *   console.log(page.offset, page.response.data.length, page.response.total);
   * }
   * ```
   */
  public async *paginate(
    route: string,
    query: EIADataQuery = {},
    options: EIAPaginateOptions = {},
  ): AsyncGenerator<EIAPage, void, undefined> {
    const pageSize = options.pageSize ?? EIA_MAX_PAGE_SIZE;
    if (
      !Number.isInteger(pageSize) || pageSize < 1 ||
      pageSize > EIA_MAX_PAGE_SIZE
    ) {
      throw new EIAError('INVALID_REQUEST', {
        reason: `pageSize must be an integer from 1 to ${EIA_MAX_PAGE_SIZE}`,
      });
    }
    const maxRows = options.maxRows ?? Infinity;
    let offset = query.offset ?? 0;
    let fetched = 0;
    while (fetched < maxRows) {
      const length = Math.min(pageSize, maxRows - fetched);
      const page = await this.getData(route, { ...query, offset, length });
      const rows = page.response.data.length;
      yield { ...page, offset };
      fetched += rows;
      offset += rows;
      const total = Number(page.response.total);
      if (rows < length || rows === 0 || (isFinite(total) && offset >= total)) {
        return;
      }
    }
  }

  /**
   * Every row of a data query, collected from {@link paginate}, with each
   * page's metadata kept alongside.
   *
   * @throws {EIAError} As {@link getData}.
   *
   * @example
   * ```ts
   * import { EIA } from '@tundraconnect/eia';
   *
   * const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });
   * const all = await eia.getAllData('petroleum/pri/spt', {
   *   frequency: 'daily',
   *   data: ['value'],
   *   facets: { series: ['RWTC'] },
   *   sort: [{ column: 'period' }],
   * });
   * console.log(all.rows.length, all.pages.length);
   * ```
   */
  public async getAllData(
    route: string,
    query: EIADataQuery = {},
    options: EIAPaginateOptions = {},
  ): Promise<EIAAllData> {
    const out: EIAAllData = { rows: [], pages: [] };
    for await (const page of this.paginate(route, query, options)) {
      if (out.pages.length === 0) {
        out.dateFormat = page.response.dateFormat;
        out.frequency = page.response.frequency;
      }
      out.rows.push(...page.response.data);
      out.pages.push({
        offset: page.offset,
        rows: page.response.data.length,
        total: page.response.total,
        ...(page.warnings && { warnings: page.warnings }),
        request: page.request,
        apiVersion: page.apiVersion,
      });
    }
    return out;
  }

  /**
   * A series by its legacy (APIv1) id, through v2's `/v2/seriesid/<id>`
   * compatibility route, e.g. `PET.RWTC.D`.
   *
   * @throws {EIAError} As {@link getData}.
   *
   * @example
   * ```ts
   * import { EIA } from '@tundraconnect/eia';
   *
   * const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });
   * const wti = await eia.getSeriesById('PET.RWTC.D');
   * console.log(wti.response.data[0]);
   * ```
   */
  public async getSeriesById(seriesId: string): Promise<EIADataResponseSchema> {
    if (!/^[A-Za-z0-9._-]+$/.test(seriesId)) {
      throw new EIAError('INVALID_REQUEST', { reason: 'invalid series id' });
    }
    return await this.__requestAndValidate(
      { path: `/v2/seriesid/${seriesId}`, method: 'GET' },
      EIADataResponseSchemaObject,
    );
  }

  /**
   * Petroleum spot prices (route `petroleum/pri/spt`), WTI and Brent daily
   * by default, oldest first, every page.
   *
   * @throws {EIAError} As {@link getData}.
   *
   * @example
   * ```ts
   * import { EIA } from '@tundraconnect/eia';
   *
   * const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });
   * const { rows } = await eia.getSpotPrices({ start: '2026-10-01' });
   * console.log(rows.filter((r) => r.series === 'RWTC').at(-1));
   * ```
   */
  public async getSpotPrices(
    query: EIASpotPriceQuery = {},
  ): Promise<EIAAllData> {
    return await this.getAllData('petroleum/pri/spt', {
      frequency: query.frequency ?? 'daily',
      data: ['value'],
      facets: {
        series: query.series ?? [EIA_SPOT_SERIES.WTI, EIA_SPOT_SERIES.BRENT],
      },
      ...(query.start && { start: query.start }),
      ...(query.end && { end: query.end }),
      sort: [{ column: 'period', direction: 'asc' }, {
        column: 'series',
        direction: 'asc',
      }],
    });
  }

  /**
   * Weekly Petroleum Status Report stocks (route `petroleum/stoc/wstk`),
   * the headline series by default, oldest first, every page.
   *
   * @throws {EIAError} As {@link getData}.
   *
   * @example
   * ```ts
   * import { EIA, EIA_WPSR_STOCK_SERIES } from '@tundraconnect/eia';
   *
   * const eia = new EIA({ auth: { type: 'CUSTOM', apiKey: 'your-eia-key' } });
   * const { rows } = await eia.getWeeklyStocks({
   *   series: [EIA_WPSR_STOCK_SERIES.CRUDE_EXCL_SPR],
   *   start: '2026-01-01',
   * });
   * console.log(rows.at(-1)?.period, rows.at(-1)?.value);
   * ```
   */
  public async getWeeklyStocks(
    query: EIAWeeklyStocksQuery = {},
  ): Promise<EIAAllData> {
    return await this.getAllData('petroleum/stoc/wstk', {
      frequency: 'weekly',
      data: ['value'],
      facets: {
        series: query.series ?? Object.values(EIA_WPSR_STOCK_SERIES),
      },
      ...(query.start && { start: query.start }),
      ...(query.end && { end: query.end }),
      sort: [{ column: 'period', direction: 'asc' }, {
        column: 'series',
        direction: 'asc',
      }],
    });
  }

  /** `petroleum/pri/spt` → `/v2/petroleum/pri/spt/`. */
  private __path(route: string): string {
    const trimmed = route.replace(/^\/?(v2\/)?/, '').replace(/\/$/, '');
    if (trimmed !== '' && !ROUTE.test(trimmed)) {
      throw new EIAError('INVALID_REQUEST', {
        reason: `invalid route "${route}"`,
      });
    }
    return trimmed === '' ? '/v2/' : `/v2/${trimmed}/`;
  }

  /**
   * Serialises a data query in EIA's bracket notation:
   * `data[0]=value`, `facets[series][0]=RWTC`, `sort[0][column]=period`.
   */
  private __dataQuery(query: EIADataQuery): Record<string, string> {
    const q: Record<string, string> = {};
    if (query.frequency) q['frequency'] = query.frequency;
    query.data?.forEach((column, i) => (q[`data[${i}]`] = column));
    for (const [facet, values] of Object.entries(query.facets ?? {})) {
      values.forEach((v, i) => (q[`facets[${facet}][${i}]`] = v));
    }
    if (query.start) q['start'] = query.start;
    if (query.end) q['end'] = query.end;
    query.sort?.forEach((s, i) => {
      q[`sort[${i}][column]`] = s.column;
      q[`sort[${i}][direction]`] = s.direction ?? 'asc';
    });
    if (query.offset !== undefined) {
      if (!Number.isInteger(query.offset) || query.offset < 0) {
        throw new EIAError('INVALID_REQUEST', {
          reason: 'offset must be a non-negative integer',
        });
      }
      q['offset'] = String(query.offset);
    }
    if (query.length !== undefined) {
      if (
        !Number.isInteger(query.length) || query.length < 1 ||
        query.length > EIA_MAX_PAGE_SIZE
      ) {
        throw new EIAError('INVALID_REQUEST', {
          reason: `length must be an integer from 1 to ${EIA_MAX_PAGE_SIZE}`,
        });
      }
      q['length'] = String(query.length);
    }
    return q;
  }

  /**
   * Adds the `api_key` query parameter. Chains to `super()` first so
   * RESTler's auth-config validation still runs.
   *
   * @param request - The request object to modify
   * @protected
   */
  protected override _authInjector(
    request: RESTlerEndpoint,
  ): void | Promise<void> {
    super._authInjector(request);
    const auth = (request.auth ?? this._getOption('auth')) as EIAAuth;
    request.query ??= {};
    request.query['api_key'] = auth.apiKey;
  }

  /**
   * Validates `auth`: `{ type: 'CUSTOM', apiKey }` with a non-empty key.
   *
   * @throws {EIAError} `CONFIG_INVALID_API_KEY`
   * @protected
   */
  protected override _processOption<K extends keyof EIAOptions>(
    key: K,
    value: EIAOptions[K],
  ): EIAOptions[K] {
    if (key === 'auth') {
      const auth = value as unknown as EIAAuth;
      if (
        !auth || auth.type !== 'CUSTOM' || typeof auth.apiKey !== 'string' ||
        auth.apiKey.trim() === ''
      ) {
        // Never echo the key: an error's context is serialised verbatim.
        throw new EIAError('CONFIG_INVALID_API_KEY', {});
      }
      value = { type: 'CUSTOM', apiKey: auth.apiKey.trim() } as EIAOptions[K];
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Every request funnels through here, so a transport failure surfaces as
   * this connect's own error: `TIMEOUT`, `NETWORK_ERROR`, or `RATE_LIMITED`
   * for an exhausted RESTler retry (`maxRetryWait`) — all `transient`.
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
      return new EIAError('RATE_LIMITED', {
        status: 429,
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new EIAError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new EIAError('NETWORK_ERROR', {}, err);
    }
    return err;
  }

  /**
   * Makes a request and validates its body against `guard`, rewrapping a
   * validation failure as `RESPONSE_ERROR`.
   *
   * @throws {EIAError} `RESPONSE_ERROR`
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
        throw new EIAError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler: passes a success body through and maps
   * an error status to an {@link EIAError}, keeping the gateway's code
   * (`API_KEY_MISSING`, `API_KEY_INVALID`, `OVER_RATE_LIMIT`) as
   * `vendorCode`.
   *
   * @throws {EIAError} `INVALID_API_KEY`, `BAD_REQUEST`, `NOT_FOUND`,
   * `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or `UNKNOWN_ERROR`.
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body;
    const [, body] = EIAErrorBodySchemaObject.safeParse(response.body);
    const error = body?.error;
    const vendorCode = typeof error === 'object' ? error.code : undefined;
    const reason = typeof error === 'string' ? error : error?.message;
    let code: EIAErrorCode;
    if (status === 429 || vendorCode === 'OVER_RATE_LIMIT') {
      code = 'RATE_LIMITED';
    } else if (
      status === 401 || status === 403 || /^API_KEY/.test(vendorCode ?? '')
    ) code = 'INVALID_API_KEY';
    else if (status === 400) code = 'BAD_REQUEST';
    else if (status === 404) code = 'NOT_FOUND';
    else code = status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN_ERROR';
    throw new EIAError(code, {
      status,
      vendorCode,
      reason,
      retryAfterSeconds: this._parseRetryAfter(response.headers),
    });
  }
}
