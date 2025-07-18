import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerMethodPayload,
  type RESTlerOptions,
  type RESTlerRequestOptions,
  RESTlerResponse,
} from '$restler';
import type { EventOptionKeys } from '$utils';
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
import { OpenExchangeError } from './OpenExchangeError.ts';
import { GuardianError, GuardianProxy, ObjectGuardian } from '$guardian';

/**
 * Options for configuring the OpenExchange client
 */
export type OpenExchangeOptions = RESTlerOptions & {
  /** API key for Open Exchange Rates API */
  appId: string;
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
 *   appId: 'your-api-key',
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

  /**
   * Creates a new OpenExchange client instance
   *
   * @param options - Configuration options for the client
   * @param options.appId - Your Open Exchange Rates API key
   * @param options.baseCurrency - Default base currency (defaults to USD)
   */
  constructor(options: EventOptionKeys<OpenExchangeOptions, RESTlerEvents>) {
    super(options, {
      baseURL: 'https://openexchangerates.org/api',
      timeout: 10,
      contentType: 'JSON',
      baseCurrency: 'USD', // Default base currency
    });
  }

  /**
   * Get API usage status and plan information
   *
   * Retrieves information about your API usage, including requests made,
   * requests remaining, and plan details.
   *
   * @returns Promise that resolves to usage and status information
   * @throws {OpenExchangeError} When API key is invalid or API is unavailable
   *
   * @example
   * ```typescript
   * const status = await client.getStatus();
   * console.log('Requests remaining:', status.usage.requests_remaining);
   * console.log('Plan:', status.plan.name);
   * ```
   */
  public async getStatus(): Promise<UsageResponseSchema> {
    const resp = await this._makeRequest({
      path: '/status.json',
    }, {
      method: 'GET',
    });
    return this.__handle<UsageResponseSchema>(resp, UsageResponseSchemaObject);
  }
  /**
   * List all available currencies
   *
   * Retrieves a list of all currencies supported by the Open Exchange Rates API,
   * including their full names and descriptions.
   *
   * @returns Promise that resolves to a mapping of currency codes to currency names
   * @throws {OpenExchangeError} When API key is invalid or API is unavailable
   *
   * @example
   * ```typescript
   * const currencies = await client.listCurrencies();
   * console.log('USD:', currencies.USD); // "United States Dollar"
   * console.log('EUR:', currencies.EUR); // "Euro"
   * ```
   */
  public async listCurrencies(): Promise<CurrenciesSchema> {
    const resp = await this._makeRequest({
      path: '/currencies.json',
    }, {
      method: 'GET',
    });
    return this.__handle<CurrenciesSchema>(resp, CurrenciesSchemaObject);
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
   * @returns Promise that resolves to a mapping of currency codes to exchange rates
   * @throws {OpenExchangeError} When API key is invalid, currency codes are invalid, or API is unavailable
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
    options = {
      ...{ base: this.getOption('baseCurrency') || 'USD' },
      ...options,
    };
    const query: Record<string, string> = {};
    let { symbols, base } = options;

    if (base) {
      query['base'] = base.toUpperCase();
    }

    if (symbols && symbols.length > 0) {
      symbols = symbols.map((s) => s.toUpperCase());
      query['symbols'] = symbols.join(',');
    }

    // Call the API
    const resp = await this._makeRequest<Record<string, unknown>>({
      path: '/latest.json',
      query: query,
    }, {
      method: 'GET',
    });

    const ratesData = this.__handle(resp, LatestRatesSchemaObject);
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
   * @returns Promise that resolves to historical rates data with metadata
   * @throws {OpenExchangeError} When API key is invalid, currency codes are invalid, or API is unavailable
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
  public async getHistoricalRates(
    date: string,
    options?: { base?: string; symbols?: string[] },
  ): Promise<HistoricalRatesSchema> {
    options = {
      ...{ base: this.getOption('baseCurrency') || 'USD' },
      ...options,
    };
    const query: Record<string, string> = {};
    let { symbols, base } = options;

    if (base) {
      query['base'] = base.toUpperCase();
    }

    if (symbols && symbols.length > 0) {
      symbols = symbols.map((s) => s.toUpperCase());
      query['symbols'] = symbols.join(',');
    }

    // Call the API
    const resp = await this._makeRequest<Record<string, unknown>>({
      path: `/historical/${date}.json`,
      query: query,
    }, {
      method: 'GET',
    });

    return this.__handle<HistoricalRatesSchema>(
      resp,
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
   * @returns Promise that resolves to time series data with rates for each date
   * @throws {OpenExchangeError} When API key is invalid, currency codes are invalid, or API is unavailable
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
  public async getTimeSeries(
    startDate: string,
    endDate: string,
    options?: { base?: string; symbols?: string[] },
  ): Promise<TimeSeriesSchema> {
    options = {
      ...{ base: this.getOption('baseCurrency') || 'USD' },
      ...options,
    };
    const query: Record<string, string> = {
      start: startDate,
      end: endDate,
    };
    let { symbols, base } = options;

    if (base) {
      query['base'] = base.toUpperCase();
    }

    if (symbols && symbols.length > 0) {
      symbols = symbols.map((s) => s.toUpperCase());
      query['symbols'] = symbols.join(',');
    }

    // Call the API
    const resp = await this._makeRequest<Record<string, unknown>>({
      path: '/time-series.json',
      query: query,
    }, {
      method: 'GET',
    });

    return this.__handle<TimeSeriesSchema>(resp, TimeSeriesSchemaObject);
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
   * @returns Promise that resolves to conversion result with detailed information
   * @throws {OpenExchangeError} When API key is invalid, currency codes are invalid, or API is unavailable
   *
   * @example
   * ```typescript
   * // Convert 100 USD to EUR using current rates
   * const conversion = await client.convert(100, 'USD', 'EUR');
   * console.log('Converted amount:', conversion.result);
   * console.log('Exchange rate:', conversion.rate);
   *
   * // Convert using historical rates
   * const historicalConversion = await client.convert(100, 'USD', 'EUR', {
   *   date: '2023-01-01'
   * });
   * ```
   */
  public async convert(
    amount: number,
    from: string,
    to: string,
    options?: { date?: string },
  ): Promise<ConvertRequestSchema> {
    const query: Record<string, string> = {
      amount: amount.toString(),
      from: from.toUpperCase(),
      to: to.toUpperCase(),
    };

    if (options?.date) {
      query['date'] = options.date;
    }

    // Call the API
    const resp = await this._makeRequest<Record<string, unknown>>({
      path: '/convert.json',
      query: query,
    }, {
      method: 'GET',
    });

    return this.__handle<ConvertRequestSchema>(
      resp,
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
   * @returns Promise that resolves to OHLC data with open, high, low, close values
   * @throws {OpenExchangeError} When API key is invalid, currency codes are invalid, or API is unavailable
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
  public async getOHLC(
    startDate: string,
    period: string,
    options?: { base?: string; symbols?: string[] },
  ): Promise<OHLCSchema> {
    options = {
      ...{ base: this.getOption('baseCurrency') || 'USD' },
      ...options,
    };
    const query: Record<string, string> = {
      start_date: startDate,
      period: period,
    };
    let { symbols, base } = options;

    if (base) {
      query['base'] = base.toUpperCase();
    }

    if (symbols && symbols.length > 0) {
      symbols = symbols.map((s) => s.toUpperCase());
      query['symbols'] = symbols.join(',');
    }

    // Call the API
    const resp = await this._makeRequest<Record<string, unknown>>({
      path: '/ohlc.json',
      query: query,
    }, {
      method: 'GET',
    });

    return this.__handle<OHLCSchema>(resp, OHLCSchemaObject);
  }

  /**
   * Injects authentication parameters into API requests
   *
   * This method automatically adds the API key (app_id) to all requests
   * if it's configured in the client options.
   *
   * @param request - The request object to modify
   * @param _options - Request options (unused)
   * @protected
   */
  protected override _authInjector(
    request: RESTlerEndpoint,
    _options: RESTlerMethodPayload & RESTlerRequestOptions,
  ): void | Promise<void> {
    if (this.hasOption('appId')) {
      if (!request.query) {
        request.query = {};
      }
      // Set app id
      request.query['app_id'] = this.getOption('appId');
    }
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
      case 'appId':
        // Must be a non-empty string
        if (typeof value !== 'string' || value.trim() === '') {
          throw new OpenExchangeError('CONFIG_INVALID_APP_ID', {
            appId: value,
          });
        }
        value = value.trim() as OpenExchangeOptions[K];
        break;
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
   * Handles API responses with comprehensive error handling and validation
   *
   * This private method centralizes response processing for all API endpoints.
   * It properly handles different HTTP status codes according to the OpenExchange
   * API documentation and validates successful responses using Guardian schemas.
   *
   * @template B - The expected response body type
   * @param resp - The HTTP response from the API
   * @param guard - Guardian schema object for validating success responses
   * @returns The validated response data
   * @throws {OpenExchangeError} When the response contains errors or validation fails
   *
   * @private
   */
  private __handle<B extends Record<string, unknown> = Record<string, unknown>>(
    resp: RESTlerResponse,
    guard: GuardianProxy<ObjectGuardian<B>>,
  ): B {
    switch (resp.status) {
      case 200: {
        // Its a body, handle and return it
        const [err, body] = guard.validate(resp.body);
        if (err) {
          throw new OpenExchangeError('RESPONSE_ERROR', {
            status: resp.status,
            body: resp.body,
          });
        } else {
          return body as B;
        }
      }
      case 401: /* falls through */
      case 400: /* falls through */
      case 403: /* falls through */
      case 404: /* falls through */
      case 429: {
        const [err, body] = ErrorSchemaObject.validate(resp.body);
        if (body) {
          switch (body.message) {
            case 'not_found':
              throw new OpenExchangeError('NOT_FOUND', {
                status: resp.status,
                body: resp.body,
              });
            case 'missing_app_id':
              throw new OpenExchangeError('MISSING_APP_ID', {
                status: resp.status,
                body: resp.body,
              });
            case 'invalid_app_id':
              throw new OpenExchangeError('INVALID_APP_ID', {
                status: resp.status,
                body: resp.body,
              });
            case 'not_allowed':
            case 'access_restricted':
              throw new OpenExchangeError('NOT_ALLOWED', {
                status: resp.status,
                body: resp.body,
              });
            default:
              throw new OpenExchangeError('RESPONSE_ERROR', {
                status: resp.status,
                body: resp.body,
              });
          }
        }
        throw new OpenExchangeError('RESPONSE_ERROR', {
          status: resp.status,
          body: resp.body,
          responseError: (err as GuardianError).toJSON(),
        });
      }
      default: {
        // Unknown status code, try to parse as success response
        const [err, body] = guard.validate(resp.body);
        if (err) {
          throw new OpenExchangeError('SERVICE_UNAVAILABLE', {
            status: resp.status,
            body: resp.body,
            responseError: (err as GuardianError).toJSON(),
          });
        } else {
          return body as B;
        }
      }
    }
  }
}
