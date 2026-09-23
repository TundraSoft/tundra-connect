import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, GuardianError } from '@guardian';
import {
  type CoinListSchema,
  CoinListSchemaObject,
  ErrorEnvelopeSchemaObject,
  type MarketsSchema,
  MarketsSchemaObject,
  type PriceSchema,
  PriceSchemaObject,
} from './schema/mod.ts';
import { CoinGeckoError } from './errors/mod.ts';

/** Base URL for the keyless/API-key-optional demo tier. */
const DEMO_BASE_URL = 'https://api.coingecko.com/api/v3';

/** Base URL for the paid pro tier. */
const PRO_BASE_URL = 'https://pro-api.coingecko.com/api/v3';

/**
 * CoinGecko authentication — no `Authorization` header, just a plain header
 * carrying the key (`x-cg-demo-api-key` or `x-cg-pro-api-key`, selected by
 * `environment`). `RESTlerAuth`'s `CUSTOM` variant exists exactly for
 * vendors like this one that don't use HTTP Basic/Bearer auth.
 */
export type CoinGeckoAuth = {
  type: 'CUSTOM';
  /**
   * Deployment environment — selects the base URL and the auth header name.
   * @default 'demo'
   */
  environment: 'demo' | 'pro';
  /**
   * CoinGecko API key. Optional in `demo` (the public, keyless tier still
   * works without one — supplying a key there is normal too, it just raises
   * the demo rate limit); required in `pro`.
   *
   * `environment` and `apiKey` are independent: setting `apiKey` alone does
   * **not** imply `environment: 'pro'`. A pro key supplied without
   * `environment: 'pro'` is sent under the *demo* header
   * (`x-cg-demo-api-key`) to the *demo* host — CoinGecko demo and pro keys
   * aren't distinguishable by format, so this connect can't detect that
   * mismatch for you; set `environment: 'pro'` explicitly whenever the key
   * is a pro key.
   */
  apiKey?: string;
};

/** Options for configuring a {@link CoinGecko} client. */
export type CoinGeckoOptions = Omit<RESTlerOptions, 'auth'> & {
  /**
   * CoinGecko credentials, supplied as
   * `{ type: 'CUSTOM', environment, apiKey? }`.
   */
  auth: CoinGeckoAuth;
};

/** Query parameters accepted by {@link CoinGecko.getPrice}. */
type GetPriceOptions = {
  /** Coin id(s) to price, as a CSV string or an array. */
  ids?: string | string[];
  /** Coin name(s) to price, as a CSV string or an array. */
  names?: string | string[];
  /** Coin symbol(s) to price, as a CSV string or an array. */
  symbols?: string | string[];
  /** Target currency code(s), as a CSV string or an array. Defaults to `usd`. */
  vsCurrencies?: string | string[];
  /** Include each coin's market cap in the response. */
  includeMarketCap?: boolean;
  /** Include each coin's 24h trading volume in the response. */
  include24hrVol?: boolean;
  /** Include each coin's 24h price change in the response. */
  include24hrChange?: boolean;
  /** Include each coin's last-updated Unix timestamp in the response. */
  includeLastUpdatedAt?: boolean;
  /** Decimal precision for currency values (`'full'` or a digit count). */
  precision?: string;
};

/** Query parameters accepted by {@link CoinGecko.listCoins}. */
type ListCoinsOptions = {
  /** Include each coin's per-platform contract addresses. */
  includePlatform?: boolean;
  /** Filter by listing status. */
  status?: 'active' | 'inactive';
};

/** Query parameters accepted by {@link CoinGecko.getMarkets}. */
type GetMarketsOptions = {
  /** Target currency code (singular — one market snapshot per request). */
  vsCurrency: string;
  /** Coin id(s) to include, as a CSV string or an array. */
  ids?: string | string[];
  /** Coin name(s) to include, as a CSV string or an array. */
  names?: string | string[];
  /** Coin symbol(s) to include, as a CSV string or an array. */
  symbols?: string | string[];
  /** Sort order (vendor-documented values, e.g. `'market_cap_desc'`). */
  order?: string;
  /** Results per page, 1-250. CoinGecko defaults to 100 when omitted. */
  perPage?: number;
  /** Page number. */
  page?: number;
  /** Include 7-day sparkline data. */
  sparkline?: boolean;
  /** Price-change-percentage window(s), as a CSV string or an array. */
  priceChangePercentage?: string | string[];
  /** Decimal precision for currency values (`'full'` or a digit count). */
  precision?: string;
};

/**
 * CoinGecko client for the [CoinGecko REST API](https://www.coingecko.com/en/api).
 *
 * Provides methods to fetch simple prices, the full coin list, and paginated
 * market data. Works keyless against the public `demo` tier, or against the
 * paid `pro` tier with an API key.
 *
 * @example
 * ```typescript
 * // Keyless demo usage
 * const client = new CoinGecko();
 * const prices = await client.getPrice({ ids: 'bitcoin', vsCurrencies: 'usd' });
 * console.log(prices.bitcoin?.usd);
 *
 * // Pro usage
 * const pro = new CoinGecko({
 *   auth: { type: 'CUSTOM', environment: 'pro', apiKey: 'your-pro-key' },
 * });
 * const markets = await pro.getMarkets({ vsCurrency: 'usd', perPage: 10 });
 * ```
 */
export class CoinGecko extends RESTler<CoinGeckoOptions> {
  /** Vendor identifier for this API client */
  public readonly vendor: string = 'CoinGecko';

  /** Deployment environment this client is configured for. */
  get environment(): 'demo' | 'pro' {
    return this._hasOption('auth')
      ? this._getOption('auth').environment
      : 'demo';
  }

  /** Configured API key, if any. */
  get apiKey(): string | undefined {
    return this._hasOption('auth') ? this._getOption('auth').apiKey : undefined;
  }

  /**
   * Creates a new CoinGecko client instance
   *
   * @param options - Configuration options for the client
   * @param options.auth - `{ type: 'CUSTOM', environment, apiKey? }` —
   * `environment` defaults to `'demo'` (keyless-capable); `apiKey` is
   * required when `environment` is `'pro'`. `environment` is never inferred
   * from `apiKey` — a pro key supplied with `environment` left as `'demo'`
   * (or omitted) is silently sent under the demo header to the demo host;
   * set `environment: 'pro'` explicitly whenever the key is a pro key (see
   * {@link CoinGeckoAuth.apiKey}).
   *
   * @throws {CoinGeckoError} `CONFIG_INVALID_ENVIRONMENT`, `CONFIG_INVALID_API_KEY`,
   * or `CONFIG_MISSING_API_KEY` when `environment` is `'pro'` and no `apiKey` is set.
   */
  constructor(options: EventOptionKeys<CoinGeckoOptions, RESTlerEvents> = {}) {
    // `baseURL` depends on `auth.environment`, and RESTler's constructor
    // validates options (including the required `baseURL`) as soon as
    // `super()` runs — so `environment` must be read off the raw incoming
    // options here, before `super()`, to compute the right default `baseURL`.
    const environment = options.auth?.environment === 'pro' ? 'pro' : 'demo';
    super(options, {
      baseURL: environment === 'pro' ? PRO_BASE_URL : DEMO_BASE_URL,
      contentType: 'JSON',
    });

    // Unlike OpenExchange (where every request needs an appId), CoinGecko's
    // `demo` tier is keyless — so `auth` has no default and an entirely
    // omitted `auth` is valid; the getters above resolve that to
    // `'demo'`/`undefined`. `_processOption`'s `'auth'` case (below) only
    // runs when the caller actually supplies a value for `auth`, so it
    // can't by itself guarantee the pro-requires-apiKey rule holds for
    // every path into this instance — this explicit post-`super()` check,
    // mirroring OpenExchange's `hasOption` guard, is what actually enforces
    // it, regardless of how `auth` got here.
    if (this.environment === 'pro' && !this.apiKey) {
      throw new CoinGeckoError('CONFIG_MISSING_API_KEY', {
        environment: this.environment,
      });
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Get the current price of one or more coins in one or more currencies
   *
   * An unknown coin id is not an error: CoinGecko returns HTTP 200 with an
   * empty object.
   *
   * @param options - Query configuration
   * @returns Promise resolving to {@link PriceSchema}.
   * @throws {CoinGeckoError} `MISSING_API_KEY`, `PLAN_RESTRICTED`,
   * `INVALID_KEY_WRONG_HOST`, `RATE_LIMITED`, `INVALID_REQUEST`, `NOT_FOUND`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const prices = await client.getPrice({
   *   ids: ['bitcoin', 'ethereum'],
   *   vsCurrencies: ['usd', 'eur'],
   *   includeMarketCap: true,
   * });
   * console.log(prices.bitcoin?.usd, prices.bitcoin?.usd_market_cap);
   * ```
   */
  public getPrice(options: GetPriceOptions = {}): Promise<PriceSchema> {
    const query: Record<string, string> = {
      vs_currencies: this.__csv(options.vsCurrencies) ?? 'usd',
    };
    this.__setIfPresent(query, 'ids', this.__csv(options.ids));
    this.__setIfPresent(query, 'names', this.__csv(options.names));
    this.__setIfPresent(query, 'symbols', this.__csv(options.symbols));
    this.__setIfPresent(
      query,
      'include_market_cap',
      this.__bool(options.includeMarketCap),
    );
    this.__setIfPresent(
      query,
      'include_24hr_vol',
      this.__bool(options.include24hrVol),
    );
    this.__setIfPresent(
      query,
      'include_24hr_change',
      this.__bool(options.include24hrChange),
    );
    this.__setIfPresent(
      query,
      'include_last_updated_at',
      this.__bool(options.includeLastUpdatedAt),
    );
    this.__setIfPresent(query, 'precision', options.precision);

    return this.__requestAndValidate(
      { path: '/simple/price', method: 'GET', query },
      PriceSchemaObject,
    );
  }

  /**
   * List every coin CoinGecko supports, with its id, symbol, and name
   *
   * @param options - Query configuration
   * @returns Promise resolving to {@link CoinListSchema}.
   * @throws {CoinGeckoError} `MISSING_API_KEY`, `PLAN_RESTRICTED`,
   * `INVALID_KEY_WRONG_HOST`, `RATE_LIMITED`, `INVALID_REQUEST`, `NOT_FOUND`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const coins = await client.listCoins({ includePlatform: true });
   * const bitcoin = coins.find((c) => c.id === 'bitcoin');
   * ```
   */
  public listCoins(
    options: ListCoinsOptions = {},
  ): Promise<CoinListSchema> {
    const query: Record<string, string> = {};
    this.__setIfPresent(
      query,
      'include_platform',
      this.__bool(options.includePlatform),
    );
    this.__setIfPresent(query, 'status', options.status);

    return this.__requestAndValidate(
      { path: '/coins/list', method: 'GET', query },
      CoinListSchemaObject,
    );
  }

  /**
   * Get paginated market data (price, market cap, volume, supply, ATH/ATL, ...)
   * for coins
   *
   * @param options - Query configuration
   * @returns Promise resolving to {@link MarketsSchema}.
   * @throws {CoinGeckoError} `MISSING_API_KEY`, `PLAN_RESTRICTED`,
   * `INVALID_KEY_WRONG_HOST`, `RATE_LIMITED`, `INVALID_REQUEST`, `NOT_FOUND`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const markets = await client.getMarkets({
   *   vsCurrency: 'usd',
   *   ids: 'bitcoin',
   *   perPage: 10,
   * });
   * console.log(markets[0]?.current_price);
   * ```
   */
  public getMarkets(options: GetMarketsOptions): Promise<MarketsSchema> {
    const query: Record<string, string> = {
      vs_currency: options.vsCurrency,
    };
    this.__setIfPresent(query, 'ids', this.__csv(options.ids));
    this.__setIfPresent(query, 'names', this.__csv(options.names));
    this.__setIfPresent(query, 'symbols', this.__csv(options.symbols));
    this.__setIfPresent(query, 'order', options.order);
    this.__setIfPresent(
      query,
      'per_page',
      options.perPage !== undefined ? String(options.perPage) : undefined,
    );
    this.__setIfPresent(
      query,
      'page',
      options.page !== undefined ? String(options.page) : undefined,
    );
    this.__setIfPresent(query, 'sparkline', this.__bool(options.sparkline));
    this.__setIfPresent(
      query,
      'price_change_percentage',
      this.__csv(options.priceChangePercentage),
    );
    this.__setIfPresent(query, 'precision', options.precision);

    return this.__requestAndValidate(
      { path: '/coins/markets', method: 'GET', query },
      MarketsSchemaObject,
    );
  }

  /**
   * Injects the CoinGecko API key header into outgoing requests
   *
   * Chaining to `super()` first preserves the base class's auth-config
   * validation (a no-op for `CUSTOM` auth, but keeps the contract). Sets
   * `x-cg-demo-api-key` or `x-cg-pro-api-key` — depending on the resolved
   * auth's `environment` — only when that auth actually carries an
   * `apiKey`; the demo tier works keyless, so no header is sent in that
   * case.
   *
   * @param endpoint - The request object to modify
   * @protected
   */
  protected override _authInjector(
    endpoint: RESTlerEndpoint,
  ): void | Promise<void> {
    super._authInjector(endpoint);
    const auth = (endpoint.auth ?? this._getOption('auth')) as
      | CoinGeckoAuth
      | undefined;
    if (auth?.apiKey === undefined) return;
    endpoint.headers ??= {};
    endpoint.headers[
      auth.environment === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'
    ] = auth.apiKey;
  }

  /**
   * Marks the CoinGecko API-key headers as sensitive
   *
   * RESTler's default sensitive set covers the standard credential headers
   * (`Authorization`, `X-Api-Key`, ...) but not CoinGecko's vendor-specific
   * `x-cg-pro-api-key`/`x-cg-demo-api-key`, so without this the raw key
   * would surface in `call`/`authFailure` event payloads and thrown-error
   * request contexts. Chaining to `super()` keeps the base set redacted too.
   *
   * @param name - The header name (as it appears on the request)
   * @returns `true` if the header's value should be redacted
   * @protected
   */
  protected override _isSensitiveHeader(name: string): boolean {
    const lower = name.toLowerCase();
    return lower === 'x-cg-pro-api-key' || lower === 'x-cg-demo-api-key' ||
      super._isSensitiveHeader(name);
  }

  /**
   * Processes and validates configuration options
   *
   * @param key - The option key to process
   * @param value - The option value to process
   * @returns The processed and validated option value
   * @throws {CoinGeckoError} `CONFIG_INVALID_ENVIRONMENT` or `CONFIG_INVALID_API_KEY`
   * when option values are invalid
   * @protected
   */
  protected override _processOption<
    K extends keyof CoinGeckoOptions,
  >(
    key: K,
    value: CoinGeckoOptions[K],
  ): CoinGeckoOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as CoinGeckoAuth | undefined;
        if (!auth || auth.type !== 'CUSTOM') {
          throw new CoinGeckoError('CONFIG_INVALID_ENVIRONMENT', {
            // May be `undefined` (a non-`CUSTOM` auth value has no
            // `environment`) — `CoinGeckoError`'s constructor fills any
            // unsupplied message-template placeholder with a neutral
            // `<environment unavailable>` filler, so the rendered message
            // never shows a literal `${environment}`.
            environment: (auth as { environment?: unknown } | undefined)
              ?.environment,
          });
        }
        const environment = auth.environment ?? 'demo';
        if (environment !== 'demo' && environment !== 'pro') {
          throw new CoinGeckoError('CONFIG_INVALID_ENVIRONMENT', {
            environment,
          });
        }
        let apiKey = auth.apiKey;
        if (apiKey !== undefined) {
          if (typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new CoinGeckoError('CONFIG_INVALID_API_KEY', { apiKey });
          }
          apiKey = apiKey.trim();
        }
        value = { type: 'CUSTOM', environment, apiKey } as CoinGeckoOptions[K];
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Joins a CSV-able option value into the query-string form CoinGecko
   * expects. An empty array (or empty string) means "nothing selected", so it
   * normalizes to `undefined` — letting a documented default kick in (e.g.
   * `vsCurrencies: []` falls back to `usd`) or the parameter be omitted
   * entirely, instead of sending an empty `param=`.
   */
  private __csv(value?: string | string[]): string | undefined {
    if (value === undefined) return undefined;
    const csv = Array.isArray(value) ? value.join(',') : value;
    return csv === '' ? undefined : csv;
  }

  /** Stringifies a boolean option value, or `undefined` when unset. */
  private __bool(value?: boolean): string | undefined {
    return value === undefined ? undefined : String(value);
  }

  /** Sets `query[key] = value` only when `value` is a non-empty string. */
  private __setIfPresent(
    query: Record<string, string>,
    key: string,
    value: string | undefined,
  ): void {
    if (value !== undefined && value !== '') {
      query[key] = value;
    }
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError} into
   * a {@link CoinGeckoError} — so `CoinGeckoError` stays the only thing a
   * public method throws for "the vendor responded, but the body doesn't
   * match what was expected." `B` is inferred from `guard`, so callers no
   * longer separately write out a `_makeRequest<B>()` type argument.
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
   * @throws {CoinGeckoError} `RESPONSE_ERROR` when the body fails validation
   *
   * @private
   */
  /**
   * Seconds a caller should wait before retrying after a 429, read from
   * whichever rate-limit header the vendor sent: `Retry-After` (delta
   * seconds or an HTTP-date), `X-RateLimit-Reset-After` (delta seconds),
   * or `X-RateLimit-Reset` / `RateLimit-Reset` (a Unix epoch in seconds or
   * milliseconds). `undefined` when none is present or parseable — the
   * value is only ever what the vendor said, never a guess.
   */
  private static __retryAfterSeconds(
    headers: Record<string, string> | undefined,
    nowMs = Date.now(),
  ): number | undefined {
    if (!headers) return undefined;
    const get = (name: string): string | undefined =>
      headers[name] ?? headers[name.toLowerCase()];
    const retryAfter = get('retry-after');
    if (retryAfter !== undefined) {
      const n = Number(retryAfter);
      if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
      const at = Date.parse(retryAfter);
      if (Number.isFinite(at)) {
        return Math.max(0, Math.ceil((at - nowMs) / 1000));
      }
    }
    const resetAfter = get('x-ratelimit-reset-after');
    if (resetAfter !== undefined) {
      const n = Number(resetAfter);
      if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
    }
    const reset = get('x-ratelimit-reset') ?? get('ratelimit-reset');
    if (reset !== undefined) {
      const n = Number(reset);
      if (Number.isFinite(n) && n > 0) {
        const epochMs = n > 1e12 ? n : n * 1000;
        return Math.max(0, Math.ceil((epochMs - nowMs) / 1000));
      }
    }
    return undefined;
  }

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
        throw new CoinGeckoError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates CoinGecko's
   * documented error envelope into a {@link CoinGeckoError}. Runs on every
   * response (registered on `_responseHandler` in the constructor); does
   * nothing for a successful response, leaving body validation to
   * {@link __requestAndValidate}.
   *
   * Tries to normalize the response body through
   * {@link ErrorEnvelopeSchemaObject} (shape B, then C, then A — see that
   * schema's docs), falling back to the raw body when none match. The
   * vendor's numeric `error_code` is only trusted for the four values
   * CoinGecko documents (10002, 10005, 10010, 10011); every other case is
   * dispatched on HTTP status.
   *
   * @param response - The parsed response, before any schema validation
   * @throws {CoinGeckoError} `MISSING_API_KEY`, `PLAN_RESTRICTED`,
   * `INVALID_KEY_WRONG_HOST`, `RATE_LIMITED`, `INVALID_REQUEST`, `NOT_FOUND`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    if (response.status !== null && response.status < 400) return response.body;

    const status = response.status ?? 0;
    const [envelopeErr, envelope] = ErrorEnvelopeSchemaObject.safeParse(
      response.body,
    );

    let vendorErrorCode: number | undefined;
    let vendorMessage: string | undefined;
    if (!envelopeErr && envelope) {
      vendorMessage = envelope.error_message;
      if ('error_code' in envelope) {
        vendorErrorCode = envelope.error_code;
      }
    }

    const context: Record<string, unknown> = { status, body: response.body };
    if (vendorMessage !== undefined) context.vendorMessage = vendorMessage;
    if (vendorErrorCode !== undefined) {
      context.vendorErrorCode = vendorErrorCode;
    }

    switch (vendorErrorCode) {
      case 10002:
        throw new CoinGeckoError('MISSING_API_KEY', context);
      case 10005:
        throw new CoinGeckoError('PLAN_RESTRICTED', context);
      case 10010:
      case 10011:
        throw new CoinGeckoError('INVALID_KEY_WRONG_HOST', context);
    }

    if (status === 429) {
      throw new CoinGeckoError('RATE_LIMITED', {
        ...context,
        retryAfterSeconds: CoinGecko.__retryAfterSeconds(response.headers),
      });
    }
    if (status === 400 || status === 422) {
      throw new CoinGeckoError('INVALID_REQUEST', context);
    }
    if (status === 404) {
      throw new CoinGeckoError('NOT_FOUND', context);
    }
    if (status >= 500 || status === 0) {
      throw new CoinGeckoError('SERVICE_UNAVAILABLE', context);
    }
    throw new CoinGeckoError('UNKNOWN_ERROR', context);
  }
}
