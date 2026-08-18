import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import {
  type ConvertRequestSchema,
  ConvertRequestSchemaObject,
  type CurrenciesSchema,
  CurrenciesSchemaObject,
  ErrorSchemaObject,
  type HistoricalRatesSchema,
  HistoricalRatesSchemaObject,
  LatestRatesSchemaObject,
  type OHLCSchema,
  OHLCSchemaObject,
  type TimeSeriesSchema,
  TimeSeriesSchemaObject,
  type UsageResponseSchema,
  UsageResponseSchemaObject,
} from './schema/mod.ts';
import { OpenExchangeError } from './errors/mod.ts';
import { type BaseGuardian, GuardianError } from '@guardian';

/**
 * Open Exchange Rates authentication — an App ID sent as the `app_id` query
 * parameter on every request. `RESTlerAuth`'s `CUSTOM` variant exists
 * exactly for vendors like this one that don't use HTTP Basic/Bearer auth.
 */
export type OpenExchangeAuth = {
  type: 'CUSTOM';
  /** Open Exchange Rates App ID. */
  appId: string;
};

/** Options for configuring an {@link OpenExchange} client. */
export type OpenExchangeOptions = Omit<RESTlerOptions, 'auth'> & {
  /** Open Exchange Rates App ID, supplied as `{ type: 'CUSTOM', appId }`. */
  auth: OpenExchangeAuth;
  /** Optional base currency for exchange rates (defaults to USD) */
  baseCurrency?: string;
};

/**
 * OpenExchange client for interacting with the Open Exchange Rates API
 *
 * Provides methods to fetch exchange rates, currency information, and perform
 * currency conversions using the Open Exchange Rates API.
 *
 * @example
 * ```typescript
 * const client = new OpenExchange({
 *   auth: { type: 'CUSTOM', appId: 'your-app-id' },
 *   baseCurrency: 'USD'
 * });
 *
 * // Get latest rates
 * const rates = await client.getRates();
 *
 * // Get historical rates
 * const historical = await client.getHistoricalRates('2023-01-01');
 *
 * // Convert currency
 * const conversion = await client.convert(100, 'USD', 'EUR');
 * ```
 */
export class OpenExchange extends RESTler<OpenExchangeOptions> {
  /** Vendor identifier for this API client */
  public readonly vendor: string = 'OpenExchange';

  /** Open Exchange Rates App ID used to authenticate requests. */
  get appId(): string {
    return this._getOption('auth').appId;
  }

  /** Default ISO 4217 base currency for rate requests. */
  get baseCurrency(): string {
    return this._getOption('baseCurrency') ?? 'USD';
  }

  /** Default request timeout in seconds. */
  get timeout(): number {
    return this._getOption('timeout') ?? 10;
  }

  /**
   * Creates a new OpenExchange client instance
   *
   * @param options - Configuration options for the client
   * @param options.auth - `{ type: 'CUSTOM', appId }` — your Open Exchange
   * Rates App ID
   * @param options.baseCurrency - Default base currency (defaults to USD)
   * @throws {OpenExchangeError} `CONFIG_INVALID_APP_ID` when `auth` is
   * missing or its `appId` is not a non-empty string.
   */
  constructor(options: EventOptionKeys<OpenExchangeOptions, RESTlerEvents>) {
    super(options, {
      baseURL: 'https://openexchangerates.org/api',
      timeout: 10,
      contentType: 'JSON',
      baseCurrency: 'USD', // Default base currency
    });
    if (!this.hasOption('auth')) {
      throw new OpenExchangeError('CONFIG_INVALID_APP_ID', {
        appId: undefined,
      });
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Get API usage status and plan information
   *
   * Retrieves information about your API usage, including requests made,
   * requests remaining, and plan details.
   *
   * @returns Promise resolving to {@link UsageResponseSchema}.
   * @throws {OpenExchangeError} `MISSING_APP_ID`, `INVALID_APP_ID`,
   * `NOT_ALLOWED`, `NOT_FOUND`, `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE`.
   *
   * @example
   * ```typescript
   * const status = await client.getStatus();
   * console.log('Requests remaining:', status.data.usage.requests_remaining);
   * console.log('Plan:', status.data.plan.name);
   * ```
   */
  public getStatus(): Promise<UsageResponseSchema> {
    return this.__requestAndValidate(
      { path: '/usage.json', method: 'GET' },
      UsageResponseSchemaObject,
    );
  }
  /**
   * List all available currencies
   *
   * Retrieves a list of all currencies supported by the Open Exchange Rates API,
   * including their full names and descriptions.
   *
   * @returns Promise resolving to {@link CurrenciesSchema}.
   * @throws {OpenExchangeError} `MISSING_APP_ID`, `INVALID_APP_ID`,
   * `NOT_ALLOWED`, `NOT_FOUND`, `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE`.
   *
   * @example
   * ```typescript
   * const currencies = await client.listCurrencies();
   * console.log('USD:', currencies.USD); // "United States Dollar"
   * console.log('EUR:', currencies.EUR); // "Euro"
   * ```
   */
  public listCurrencies(): Promise<CurrenciesSchema> {
    return this.__requestAndValidate(
      { path: '/currencies.json', method: 'GET' },
      CurrenciesSchemaObject,
    );
  }

  /**
   * Get latest exchange rates
   *
   * Retrieves the latest exchange rates for all supported currencies or
   * a specific subset of currencies.
   *
   * @param options - Optional configuration for the request
   * @param options.base - Base currency for the rates (defaults to USD or configured baseCurrency)
   * @param options.symbols - Array of currency codes to limit the results to
   * @returns Promise resolving to a currency-code-to-rate map.
   * @throws {OpenExchangeError} `MISSING_APP_ID`, `INVALID_APP_ID`,
   * `NOT_ALLOWED`, `NOT_FOUND`, `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE`.
   *
   * @example
   * ```typescript
   * // Get all rates with USD as base
   * const allRates = await client.getRates();
   *
   * // Get rates for specific currencies
   * const specificRates = await client.getRates({
   *   base: 'EUR',
   *   symbols: ['USD', 'GBP', 'JPY']
   * });
   *
   * console.log('EUR to USD rate:', specificRates.USD);
   * ```
   */
  public async getRates(
    options?: { base?: string; symbols?: string[] },
  ): Promise<Record<string, number>> {
    const query = this.__baseAndSymbolsQuery(options);

    // Call the API
    const ratesData = await this.__requestAndValidate(
      { path: '/latest.json', query, method: 'GET' },
      LatestRatesSchemaObject,
    );
    return ratesData.rates;
  }

  /**
   * Get historical exchange rates for a specific date
   *
   * Retrieves exchange rates for a specific date in the past. The date should
   * be in YYYY-MM-DD format.
   *
   * @param date - Date in YYYY-MM-DD format (e.g., '2023-01-01')
   * @param options - Optional configuration for the request
   * @param options.base - Base currency for the rates (defaults to USD or configured baseCurrency)
   * @param options.symbols - Array of currency codes to limit the results to
   * @returns Promise resolving to {@link HistoricalRatesSchema}.
   * @throws {OpenExchangeError} `INVALID_DATE` when `date` is not a
   * `YYYY-MM-DD` string (rejected locally, before any request is sent);
   * `MISSING_APP_ID`, `INVALID_APP_ID`, `NOT_ALLOWED`, `NOT_FOUND`,
   * `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE`.
   *
   * @example
   * ```typescript
   * // Get historical rates for January 1, 2023
   * const historical = await client.getHistoricalRates('2023-01-01');
   * console.log('Historical rates:', historical.rates);
   * console.log('Timestamp:', historical.timestamp);
   *
   * // Get historical rates for specific currencies
   * const specificHistorical = await client.getHistoricalRates('2023-01-01', {
   *   base: 'EUR',
   *   symbols: ['USD', 'GBP']
   * });
   * ```
   */
  // NOTE: declared `async` deliberately — the date guard below throws
  // synchronously before the first await, and without `async` that throw
  // would escape as a synchronous exception instead of the promise
  // rejection every caller (and assertRejects) expects.
  public async getHistoricalRates(
    date: string,
    options?: { base?: string; symbols?: string[] },
  ): Promise<HistoricalRatesSchema> {
    // The date is interpolated into the URL path — validate its shape
    // locally so path-traversal-ish inputs ('../latest') can't collapse
    // onto a different (shape-identical) endpoint, and malformed dates
    // ('2023/01/01') fail loudly here instead of as a misleading vendor
    // 404.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new OpenExchangeError('INVALID_DATE', { date });
    }
    const query = this.__baseAndSymbolsQuery(options);

    // Call the API — encodeURIComponent is defense-in-depth on top of the
    // format guard above (a passing date never needs encoding).
    return await this.__requestAndValidate(
      {
        path: `/historical/${encodeURIComponent(date)}.json`,
        query,
        method: 'GET',
      },
      HistoricalRatesSchemaObject,
    );
  }

  /**
   * Get time series exchange rate data
   *
   * Retrieves exchange rates for a range of dates, providing time series data
   * for analysis. Both dates should be in YYYY-MM-DD format.
   *
   * @param startDate - Start date in YYYY-MM-DD format (e.g., '2023-01-01')
   * @param endDate - End date in YYYY-MM-DD format (e.g., '2023-01-31')
   * @param options - Optional configuration for the request
   * @param options.base - Base currency for the rates (defaults to USD or configured baseCurrency)
   * @param options.symbols - Array of currency codes to limit the results to
   * @returns Promise resolving to {@link TimeSeriesSchema}.
   * @throws {OpenExchangeError} `MISSING_APP_ID`, `INVALID_APP_ID`,
   * `NOT_ALLOWED`, `NOT_FOUND`, `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE`.
   *
   * @example
   * ```typescript
   * // Get time series data for January 2023
   * const timeSeries = await client.getTimeSeries('2023-01-01', '2023-01-31');
   * console.log('Rates for 2023-01-01:', timeSeries.rates['2023-01-01']);
   *
   * // Get time series for specific currencies
   * const specificTimeSeries = await client.getTimeSeries('2023-01-01', '2023-01-31', {
   *   base: 'EUR',
   *   symbols: ['USD', 'GBP']
   * });
   * ```
   */
  public getTimeSeries(
    startDate: string,
    endDate: string,
    options?: { base?: string; symbols?: string[] },
  ): Promise<TimeSeriesSchema> {
    const query: Record<string, string> = {
      start: startDate,
      end: endDate,
      ...this.__baseAndSymbolsQuery(options),
    };

    // Call the API
    return this.__requestAndValidate(
      { path: '/time-series.json', query, method: 'GET' },
      TimeSeriesSchemaObject,
    );
  }

  /**
   * Convert currency amounts
   *
   * Converts a specific amount from one currency to another using current
   * or historical exchange rates.
   *
   * @param amount - The amount to convert
   * @param from - Source currency code (e.g., 'USD')
   * @param to - Target currency code (e.g., 'EUR')
   * @param options - Optional configuration for the request
   * @param options.date - Specific date for historical conversion (YYYY-MM-DD format)
   * @returns Promise resolving to {@link ConvertRequestSchema}.
   * @throws {OpenExchangeError} `MISSING_APP_ID`, `INVALID_APP_ID`,
   * `NOT_ALLOWED`, `NOT_FOUND`, `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE`.
   *
   * @example
   * ```typescript
   * // Convert 100 USD to EUR using current rates
   * const conversion = await client.convert(100, 'USD', 'EUR');
   * console.log('Converted amount:', conversion.response);
   * console.log('Exchange rate:', conversion.meta.rate);
   *
   * // Convert using historical rates
   * const historicalConversion = await client.convert(100, 'USD', 'EUR', {
   *   date: '2023-01-01'
   * });
   * ```
   */
  public convert(
    amount: number,
    from: string,
    to: string,
    options?: { date?: string },
  ): Promise<ConvertRequestSchema> {
    const query: Record<string, string> = {};

    if (options?.date) {
      query['date'] = options.date;
    }

    // Call the API — OpenExchangeRates' convert endpoint is path-based:
    // GET /convert/{value}/{from}/{to}, not a query-param variant.
    return this.__requestAndValidate(
      {
        path: `/convert/${encodeURIComponent(amount)}/${
          encodeURIComponent(from.toUpperCase())
        }/${encodeURIComponent(to.toUpperCase())}`,
        query,
        method: 'GET',
      },
      ConvertRequestSchemaObject,
    );
  }

  /**
   * Get OHLC (Open, High, Low, Close) data
   *
   * Retrieves OHLC data for currency pairs over a specified time period.
   * Useful for financial analysis and charting applications.
   *
   * @param startDate - Start date in YYYY-MM-DD format (e.g., '2023-01-01')
   * @param period - Time period for OHLC data (e.g., '1d', '1w', '1m')
   * @param options - Optional configuration for the request
   * @param options.base - Base currency for the rates (defaults to USD or configured baseCurrency)
   * @param options.symbols - Array of currency codes to limit the results to
   * @returns Promise resolving to {@link OHLCSchema}.
   * @throws {OpenExchangeError} `MISSING_APP_ID`, `INVALID_APP_ID`,
   * `NOT_ALLOWED`, `NOT_FOUND`, `RESPONSE_ERROR`, or `SERVICE_UNAVAILABLE`.
   *
   * @example
   * ```typescript
   * // Get daily OHLC data for EUR/USD
   * const ohlc = await client.getOHLC('2023-01-01', '1d', {
   *   base: 'EUR',
   *   symbols: ['USD']
   * });
   *
   * const eurUsdData = ohlc.rates.USD;
   * console.log('Open:', eurUsdData.open);
   * console.log('High:', eurUsdData.high);
   * console.log('Low:', eurUsdData.low);
   * console.log('Close:', eurUsdData.close);
   * ```
   */
  public getOHLC(
    startDate: string,
    period: string,
    options?: { base?: string; symbols?: string[] },
  ): Promise<OHLCSchema> {
    // OpenExchangeRates' OHLC docs are inconsistent about this parameter's
    // name — prose examples use `start`, but the OpenAPI/parameter listing
    // (the canonical source) names it `start_time`.
    const query: Record<string, string> = {
      start_time: startDate,
      period: period,
      ...this.__baseAndSymbolsQuery(options),
    };

    // Call the API
    return this.__requestAndValidate(
      { path: '/ohlc.json', query, method: 'GET' },
      OHLCSchemaObject,
    );
  }

  /**
   * Injects the App ID into every request's query string
   *
   * OpenExchange authenticates via a query parameter rather than a header,
   * so this overrides the base `_authInjector` — chaining to `super()` first
   * keeps the base class's auth-config validation in place.
   *
   * @param request - The request object to modify
   * @protected
   */
  protected override _authInjector(
    request: RESTlerEndpoint,
  ): void | Promise<void> {
    super._authInjector(request);
    const auth = request.auth ?? this._getOption('auth');
    request.query ??= {};
    request.query['app_id'] = (auth as OpenExchangeAuth).appId;
  }

  /**
   * Processes and validates configuration options
   *
   * This method validates and normalizes configuration options specific to
   * the OpenExchange client before passing them to the parent class.
   *
   * @param key - The option key to process
   * @param value - The option value to process
   * @returns The processed and validated option value
   * @throws {OpenExchangeError} When option values are invalid
   * @protected
   */
  protected override _processOption<
    K extends keyof OpenExchangeOptions,
  >(
    key: K,
    value: OpenExchangeOptions[K],
  ): OpenExchangeOptions[K] {
    // Otherwise, pass to parent class for standard RESTlerOptions keys
    switch (key) {
      case 'auth': {
        const auth = value as unknown as OpenExchangeAuth;
        if (
          !auth || auth.type !== 'CUSTOM' ||
          typeof auth.appId !== 'string' || auth.appId.trim() === ''
        ) {
          throw new OpenExchangeError('CONFIG_INVALID_APP_ID', {
            appId: auth?.appId,
          });
        }
        value = {
          type: 'CUSTOM',
          appId: auth.appId.trim(),
        } as OpenExchangeOptions[K];
        break;
      }
      case 'baseCurrency':
        // Must be 3 characters long
        if (typeof value !== 'string' || value.length !== 3) {
          throw new OpenExchangeError('CONFIG_INVALID_BASE_CURRENCY', {
            baseCurrency: value,
          });
        }
        value = value.toUpperCase() as OpenExchangeOptions[K];
        break;
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Builds the `base`/`symbols` query fragment shared by every rates-style
   * endpoint (`getRates`, `getHistoricalRates`, `getTimeSeries`, `getOHLC`).
   * `base` falls back to {@link baseCurrency} when omitted; `symbols`, when
   * given a non-empty array, is uppercased and comma-joined. Callers merge
   * the returned object with whatever other query params their endpoint
   * needs.
   *
   * @param options - `base`/`symbols` portion of the caller's options
   * @returns A query-param fragment containing `base` and/or `symbols`
   * @private
   */
  private __baseAndSymbolsQuery(
    options?: { base?: string; symbols?: string[] },
  ): Record<string, string> {
    const merged = { base: this.baseCurrency, ...options };
    const query: Record<string, string> = {};
    let { symbols, base } = merged;

    if (base) {
      query['base'] = base.toUpperCase();
    }

    if (symbols && symbols.length > 0) {
      symbols = symbols.map((s) => s.toUpperCase());
      query['symbols'] = symbols.join(',');
    }

    return query;
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into an {@link OpenExchangeError} — so `OpenExchangeError` stays the
   * only thing a public method throws for "the vendor responded, but the
   * body doesn't match what was expected." `B` is inferred from `guard`,
   * so callers no longer separately write out a `_makeRequest<B>()` type
   * argument.
   *
   * By the time a method calls this, {@link _responseHandler} has already
   * run and thrown for any documented vendor error — this only has to
   * handle a response whose status looked fine but whose body doesn't
   * match what was expected.
   *
   * @template B - The expected response body type
   * @param endpoint - The endpoint to request
   * @param guard - Guardian schema object for validating the response
   * @returns The validated response data
   * @throws {OpenExchangeError} `RESPONSE_ERROR` when the body fails
   * validation
   *
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
        throw new OpenExchangeError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates OpenExchange's
   * documented error envelope into an {@link OpenExchangeError}. Runs on
   * every response (registered on `_responseHandler` in the constructor);
   * does nothing for a response that isn't one of the five documented error
   * statuses, leaving success-body validation to {@link __parse}.
   *
   * @param response - The parsed response, before any schema validation
   * @throws {OpenExchangeError} `NOT_FOUND`, `MISSING_APP_ID`,
   * `INVALID_APP_ID`, `NOT_ALLOWED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE` (undocumented 5xx), or `UNKNOWN_ERROR`
   * (undocumented 4xx), matching the vendor's documented status/message
   * pairs.
   *
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const documentedErrorStatus = [400, 401, 403, 404, 429].includes(
      response.status as number,
    );
    if (!documentedErrorStatus) {
      const status = response.status ?? 0;
      if (status >= 400) {
        // Reserve SERVICE_UNAVAILABLE for genuine server-side (5xx)
        // failures — an undocumented 4xx is a request-side problem, not an
        // outage, so fall back to UNKNOWN_ERROR instead.
        throw new OpenExchangeError(
          status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN_ERROR',
          {
            status: response.status,
            body: response.body,
          },
        );
      }
      return response.body;
    }

    const [envelopeErr, envelope] = ErrorSchemaObject.safeParse(
      response.body,
    );
    if (envelope) {
      switch (envelope.message) {
        case 'not_found':
          throw new OpenExchangeError('NOT_FOUND', {
            status: response.status,
            body: response.body,
          });
        case 'missing_app_id':
          throw new OpenExchangeError('MISSING_APP_ID', {
            status: response.status,
            body: response.body,
          });
        case 'invalid_app_id':
          throw new OpenExchangeError('INVALID_APP_ID', {
            status: response.status,
            body: response.body,
          });
        case 'not_allowed':
        case 'access_restricted':
          throw new OpenExchangeError('NOT_ALLOWED', {
            status: response.status,
            body: response.body,
          });
        default:
          throw new OpenExchangeError('RESPONSE_ERROR', {
            status: response.status,
            body: response.body,
          });
      }
    }
    throw new OpenExchangeError('RESPONSE_ERROR', {
      status: response.status,
      body: response.body,
      responseError: envelopeErr?.toJSON(),
    });
  }
}
