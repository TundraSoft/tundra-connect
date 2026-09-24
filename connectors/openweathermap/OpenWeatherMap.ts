import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import { RESTlerRateLimitError } from '@restler/errors';
import type { EventOptionKeys } from '@utils';
import {
  type CurrentWeatherSchema,
  CurrentWeatherSchemaObject,
  ErrorSchemaObject,
  type ForecastSchema,
  ForecastSchemaObject,
} from './schema/mod.ts';
import {
  OpenWeatherMapError,
  type OpenWeatherMapErrorCode,
} from './errors/mod.ts';
import { type BaseGuardian, GuardianError } from '@guardian';

/**
 * OpenWeatherMap authentication — an API key sent as the `appid` query
 * parameter on every request. `RESTlerAuth`'s `CUSTOM` variant exists
 * exactly for vendors like this one that don't use HTTP Basic/Bearer auth.
 */
export type OpenWeatherMapAuth = {
  type: 'CUSTOM';
  /** OpenWeatherMap API key. */
  apiKey: string;
};

/** Options for configuring an {@link OpenWeatherMap} client. */
export type OpenWeatherMapOptions = Omit<RESTlerOptions, 'auth'> & {
  /** OpenWeatherMap API key, supplied as `{ type: 'CUSTOM', apiKey }`. */
  auth: OpenWeatherMapAuth;
};

/** Unit system for temperature and speed fields. Omit to receive Kelvin/standard units. */
export type OpenWeatherMapUnits = 'standard' | 'metric' | 'imperial';

/**
 * A location, expressed one of four documented ways. Exactly one variant
 * should be supplied — `lat`/`lon` is the most robust since it never
 * depends on the vendor's geocoding.
 */
export type OpenWeatherMapLocation =
  | { lat: number; lon: number }
  | { q: string }
  | { zip: string; country?: string }
  | { id: number };

/** Options accepted by {@link OpenWeatherMap.getCurrentWeather}. */
export type CurrentWeatherOptions = OpenWeatherMapLocation & {
  /** Unit system for the response (defaults to standard/Kelvin). */
  units?: OpenWeatherMapUnits;
  /** Response language code (e.g. `en`, `fr`). */
  lang?: string;
};

/** Options accepted by {@link OpenWeatherMap.getForecast}. */
export type ForecastOptions = CurrentWeatherOptions & {
  /** Limits the number of returned 3-hour timestamps (max 40 = 5 days). */
  cnt?: number;
};

/**
 * OpenWeatherMap client for interacting with the OpenWeatherMap API
 *
 * Provides methods to fetch current weather conditions and the 5-day/3-hour
 * forecast using OpenWeatherMap's free-tier `data/2.5` endpoints. Uses
 * RESTler for transport and Guardian for runtime response validation.
 *
 * @example
 * ```typescript
 * const client = new OpenWeatherMap({
 *   auth: { type: 'CUSTOM', apiKey: 'your-api-key' },
 * });
 *
 * // Current weather by coordinates
 * const current = await client.getCurrentWeather({ lat: 51.51, lon: -0.13 });
 *
 * // 5-day forecast by city name
 * const forecast = await client.getForecast({ q: 'London,GB', units: 'metric' });
 * ```
 */
export class OpenWeatherMap extends RESTler<OpenWeatherMapOptions> {
  /** Vendor identifier for this API client */
  public readonly vendor: string = 'OpenWeatherMap';

  /** Default request timeout in seconds. */
  get timeout(): number {
    return this._getOption('timeout') ?? 10;
  }

  /**
   * Creates a new OpenWeatherMap client instance
   *
   * @param options - Configuration options for the client
   * @param options.auth - `{ type: 'CUSTOM', apiKey }` — your OpenWeatherMap
   * API key
   * @throws {OpenWeatherMapError} `CONFIG_INVALID_API_KEY` when `auth` is
   * missing or its `apiKey` is not a non-empty string.
   */
  constructor(options: EventOptionKeys<OpenWeatherMapOptions, RESTlerEvents>) {
    super(options, {
      baseURL: 'https://api.openweathermap.org/data/2.5',
      timeout: 10,
      contentType: 'JSON',
    });
    // `auth` is required by the type, but `EventOptionKeys` makes every
    // option optional at the type level, so a caller that bypasses the
    // type checker (or builds options dynamically) can omit it entirely.
    // `_setOptions` only routes keys actually PRESENT on the constructor
    // argument through `_processOption`, so an absent `auth` slips past
    // the switch-based validation below and would otherwise only surface
    // as a raw auth failure on the first request. Fail fast here instead.
    if (!this._hasOption('auth')) {
      throw new OpenWeatherMapError('CONFIG_INVALID_API_KEY', {
        apiKey: undefined,
      });
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Get current weather conditions for a location
   *
   * Retrieves the current weather for a location identified by
   * coordinates, city name, ZIP/postal code, or city ID. Exactly one of
   * `lat`+`lon`, `q`, `zip`, or `id` should be supplied.
   *
   * @param options - Location and formatting options for the request
   * @param options.lat - Latitude (paired with `lon`)
   * @param options.lon - Longitude (paired with `lat`)
   * @param options.q - City name, optionally `city,state,country`
   * @param options.zip - ZIP/postal code, optionally `zip,country` (country defaults to `US`)
   * @param options.id - OpenWeatherMap city ID
   * @param options.units - `'standard'` (default, Kelvin), `'metric'`, or `'imperial'`
   * @param options.lang - Response language code
   * @returns Promise resolving to {@link CurrentWeatherSchema}.
   * @throws {OpenWeatherMapError} `INVALID_REQUEST` when none of `lat`+`lon`,
   * `q`, `zip`, or `id` is supplied; `INVALID_API_KEY`, `LOCATION_NOT_FOUND`,
   * `RATE_LIMITED`, `BAD_REQUEST`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`
   * (5xx), or `UNKNOWN_ERROR` (unmapped 4xx).
   *
   * @example
   * ```typescript
   * const weather = await client.getCurrentWeather({
   *   lat: 51.51,
   *   lon: -0.13,
   *   units: 'metric',
   * });
   * console.log('Temperature:', weather.main.temp);
   * console.log('Condition:', weather.weather[0]?.description);
   * ```
   */
  public async getCurrentWeather(
    options: CurrentWeatherOptions,
  ): Promise<CurrentWeatherSchema> {
    const query = this.__locationQuery(options);
    if (options.units) {
      query['units'] = options.units;
    }
    if (options.lang) {
      query['lang'] = options.lang;
    }

    return await this.__requestAndValidate(
      { path: '/weather', query, method: 'GET' },
      CurrentWeatherSchemaObject,
    );
  }

  /**
   * Get the 5-day/3-hour weather forecast for a location
   *
   * Retrieves forecast data in 3-hour steps for up to 5 days, for a
   * location identified by coordinates, city name, ZIP/postal code, or
   * city ID. Exactly one of `lat`+`lon`, `q`, `zip`, or `id` should be
   * supplied.
   *
   * @param options - Location and formatting options for the request
   * @param options.lat - Latitude (paired with `lon`)
   * @param options.lon - Longitude (paired with `lat`)
   * @param options.q - City name, optionally `city,state,country`
   * @param options.zip - ZIP/postal code, optionally `zip,country` (country defaults to `US`)
   * @param options.id - OpenWeatherMap city ID
   * @param options.units - `'standard'` (default, Kelvin), `'metric'`, or `'imperial'`
   * @param options.lang - Response language code
   * @param options.cnt - Limits the number of returned timestamps (max 40)
   * @returns Promise resolving to {@link ForecastSchema}.
   * @throws {OpenWeatherMapError} `INVALID_REQUEST` when none of `lat`+`lon`,
   * `q`, `zip`, or `id` is supplied; `INVALID_API_KEY`, `LOCATION_NOT_FOUND`,
   * `RATE_LIMITED`, `BAD_REQUEST`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`
   * (5xx), or `UNKNOWN_ERROR` (unmapped 4xx).
   *
   * @example
   * ```typescript
   * const forecast = await client.getForecast({ q: 'London,GB', cnt: 8 });
   * console.log('First entry:', forecast.list[0]?.main.temp);
   * console.log('City:', forecast.city.name);
   * ```
   */
  public async getForecast(options: ForecastOptions): Promise<ForecastSchema> {
    const query = this.__locationQuery(options);
    if (options.units) {
      query['units'] = options.units;
    }
    if (options.lang) {
      query['lang'] = options.lang;
    }
    if (options.cnt !== undefined) {
      query['cnt'] = String(options.cnt);
    }

    return await this.__requestAndValidate(
      { path: '/forecast', query, method: 'GET' },
      ForecastSchemaObject,
    );
  }

  /**
   * Injects the API key into every request's query string
   *
   * OpenWeatherMap authenticates via a query parameter rather than a
   * header, so this overrides the base `_authInjector` — chaining to
   * `super()` first keeps the base class's auth-config validation in
   * place.
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
    request.query['appid'] = (auth as OpenWeatherMapAuth).apiKey;
  }

  /**
   * Processes and validates configuration options
   *
   * This method validates and normalizes configuration options specific to
   * the OpenWeatherMap client before passing them to the parent class.
   *
   * @param key - The option key to process
   * @param value - The option value to process
   * @returns The processed and validated option value
   * @throws {OpenWeatherMapError} When option values are invalid
   * @protected
   */
  protected override _processOption<
    K extends keyof OpenWeatherMapOptions,
  >(
    key: K,
    value: OpenWeatherMapOptions[K],
  ): OpenWeatherMapOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as OpenWeatherMapAuth;
        if (
          !auth || auth.type !== 'CUSTOM' ||
          typeof auth.apiKey !== 'string' || auth.apiKey.trim() === ''
        ) {
          // Never echo the raw `auth.apiKey` value here — `context` is
          // stored on the thrown error verbatim (see `BaseError.toJSON()`),
          // so anything placed here is just as exposed as the message text.
          throw new OpenWeatherMapError('CONFIG_INVALID_API_KEY', {});
        }
        value = {
          type: 'CUSTOM',
          apiKey: auth.apiKey.trim(),
        } as OpenWeatherMapOptions[K];
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Builds the location portion of a request's query string from a
   * documented {@link OpenWeatherMapLocation} variant.
   *
   * Exactly one of `lat`+`lon` (both together), `q`, `zip`, or `id` must be
   * supplied — this only checks that at least one recognised variant carries
   * a defined value (in the documented precedence order) and fails closed
   * rather than silently sending a location-less request when none match. It
   * does NOT check for multiple variants being supplied at once; when more
   * than one carries a value, the existing precedence order still applies.
   *
   * Branches on VALUES, not key presence: a key whose value is `undefined`
   * (common with spread-built option objects like
   * `{ lat: undefined, lon: undefined, q: 'London' }`) is treated as absent,
   * so precedence falls through to the next supplied variant instead of
   * serialising the literal string `undefined` into the query. `lat: 0` /
   * `lon: 0` remain valid — the checks are `!== undefined`, not truthiness.
   *
   * @param location - Coordinates, city name, ZIP/postal code, or city ID
   * @returns Query parameters identifying the location
   * @throws {OpenWeatherMapError} `INVALID_REQUEST` when none of `lat`+`lon`,
   * `q`, `zip`, or `id` carries a defined value.
   * @private
   */
  private __locationQuery(
    location: OpenWeatherMapLocation,
  ): Record<string, string> {
    // The union's variants share no keys, so widen to a partial view of all
    // of them for the value checks below.
    const loc = location as Partial<
      { lat: number; lon: number } & { q: string } & {
        zip: string;
        country?: string;
      } & { id: number }
    >;
    const query: Record<string, string> = {};
    if (loc.lat !== undefined && loc.lon !== undefined) {
      query['lat'] = String(loc.lat);
      query['lon'] = String(loc.lon);
    } else if (loc.q !== undefined) {
      query['q'] = loc.q;
    } else if (loc.zip !== undefined) {
      query['zip'] = `${loc.zip},${loc.country ?? 'US'}`;
    } else if (loc.id !== undefined) {
      query['id'] = String(loc.id);
    } else {
      throw new OpenWeatherMapError('INVALID_REQUEST', {
        reason:
          'exactly one of lat+lon, q, zip, or id must be supplied to identify a location',
      });
    }
    return query;
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into an {@link OpenWeatherMapError} — so `OpenWeatherMapError` stays the
   * only thing a public method throws for "the vendor responded, but the
   * body doesn't match what was expected." `B` is inferred from `guard`, so
   * callers no longer separately write out a `_makeRequest<B>()` type
   * argument.
   *
   * By the time a method calls this, {@link _responseHandler} has already
   * run and thrown for any documented vendor error — this only has to
   * handle a response whose status looked fine but whose body doesn't match
   * what was expected.
   *
   * @template B - The expected response body type
   * @param endpoint - The endpoint to request
   * @param guard - Guardian schema object for validating the response
   * @returns The validated response data
   * @throws {OpenWeatherMapError} `RESPONSE_ERROR` when the body fails
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
        throw new OpenWeatherMapError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      if (err instanceof RESTlerRateLimitError) {
        // RESTler retried once (maxRetryWait) and was throttled again, or the
        // vendor's hint exceeded the cap — surface it as this connect's own
        // error, with the hint and whether a wait already happened.
        throw new OpenWeatherMapError('RATE_LIMITED', {
          status: 429,
          retryAfterSeconds: err.getContextValue('retryAfter'),
          retried: err.getContextValue('retried'),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates OpenWeatherMap's
   * HTTP-status/error-envelope conventions into an {@link OpenWeatherMapError}.
   * Runs on every response (registered on `_responseHandler` in the
   * constructor); does nothing for a response below 400, leaving
   * success-body validation to {@link __requestAndValidate}.
   *
   * Unlike OpenExchange, OpenWeatherMap's error `message` is free text
   * rather than a documented enum — so this keys off the HTTP status code
   * instead of trying to switch on `message`.
   *
   * The error body is `.safeParse()`d against {@link ErrorSchemaObject}
   * (OpenWeatherMap's documented `{ cod, message }` error envelope) rather
   * than cast unchecked — but since the mapping already keys off the HTTP
   * status rather than anything in the body, a body that fails validation
   * doesn't change which code gets thrown; it only falls back to an
   * `undefined` `vendorMessage` (mirrors Stripe/SendGrid's `__toError`,
   * which fall back the same way when the vendor's error envelope doesn't
   * parse).
   *
   * @param response - The parsed response, before any schema validation
   * @throws {OpenWeatherMapError} `INVALID_API_KEY`, `LOCATION_NOT_FOUND`,
   * `RATE_LIMITED`, `BAD_REQUEST`, `SERVICE_UNAVAILABLE` (5xx), or
   * `UNKNOWN_ERROR` (any other unmapped 4xx), matching the vendor's HTTP
   * status code.
   *
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    const [, body] = ErrorSchemaObject.safeParse(response.body);
    const code = this.__errorCodeForStatus(status);
    throw new OpenWeatherMapError(code, {
      retryAfterSeconds: this._parseRetryAfter(response.headers),
      status,
      body: response.body,
      vendorMessage: body?.message,
    });
  }

  /**
   * Maps an HTTP status code to a stable, connect-specific error code.
   *
   * OpenWeatherMap doesn't give a machine-readable code beyond the numeric
   * HTTP status it echoes back as `cod` — these codes are therefore
   * connect-specific rather than literally vendor-provided.
   *
   * @param status - HTTP status code of the response
   * @private
   */
  private __errorCodeForStatus(status: number): OpenWeatherMapErrorCode {
    switch (status) {
      case 401:
        return 'INVALID_API_KEY';
      case 404:
        return 'LOCATION_NOT_FOUND';
      case 429:
        return 'RATE_LIMITED';
      case 400:
        return 'BAD_REQUEST';
      default:
        // Reserve SERVICE_UNAVAILABLE for genuine server-side (5xx)
        // failures — an unmapped 4xx is a request-side problem the vendor
        // hasn't documented, not an outage, so fall back to UNKNOWN_ERROR
        // (matching every sibling connect's convention).
        return status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN_ERROR';
    }
  }
}
