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
  type DeribitBookSummarySchema,
  DeribitBookSummarySchemaObject,
  type DeribitIndexPriceSchema,
  DeribitIndexPriceSchemaObject,
  type DeribitInstrumentSchema,
  DeribitInstrumentSchemaObject,
  type DeribitOrderBookSchema,
  DeribitOrderBookSchemaObject,
  type DeribitRpcEnvelopeSchema,
  DeribitRpcEnvelopeSchemaObject,
  type DeribitTickerSchema,
  DeribitTickerSchemaObject,
  type DeribitTradesPageSchema,
  DeribitTradesPageSchemaObject,
  type DeribitVolatilityIndexDataSchema,
  DeribitVolatilityIndexDataSchemaObject,
} from './schema/mod.ts';
import { DeribitError, deribitErrorCode } from './errors/mod.ts';
import { parseJsonLossless } from './json.ts';

/** `production` (www.deribit.com) or `testnet` (test.deribit.com). */
export type DeribitEnvironment = 'production' | 'testnet';

/** REST base URLs by environment. */
export const DERIBIT_REST_URLS: Readonly<Record<DeribitEnvironment, string>> = {
  production: 'https://www.deribit.com/api/v2',
  testnet: 'https://test.deribit.com/api/v2',
};

/**
 * Deribit's history host: the full trade archive, for ranges the main API
 * no longer serves. Production data only.
 */
export const DERIBIT_HISTORY_URL = 'https://history.deribit.com/api/v2';

/** Options for configuring a {@link Deribit} REST client. Public endpoints need no credentials. */
export type DeribitOptions = Omit<RESTlerOptions, 'auth' | 'baseURL'> & {
  /** @default 'production' */
  environment?: DeribitEnvironment;
  /** Override the REST base URL (a mock server, a proxy). */
  baseURL?: string;
};

/** Instrument kinds Deribit lists. */
export type DeribitKind =
  | 'future'
  | 'option'
  | 'spot'
  | 'future_combo'
  | 'option_combo';

/** Query for {@link Deribit.getInstruments}. */
export type DeribitInstrumentsQuery = {
  /** `BTC`, `ETH`, `USDC`, `USDT`, `EURR`, or `any`. */
  currency: string;
  kind?: DeribitKind;
  /** List expired instruments instead of active ones. @default false */
  expired?: boolean;
};

/** Query for {@link Deribit.getOptionChain}. */
export type DeribitOptionChainQuery = {
  /** `BTC`, `ETH`, ... */
  currency: string;
  /**
   * Keep one expiry: Deribit's code (`7NOV26`, as in the instrument name)
   * or the expiration timestamp in Unix ms. Omit for every expiry.
   */
  expiry?: string | number;
};

/** Where trade queries read from. */
export type DeribitTradeSource = 'live' | 'history';

/** Common trade-query fields. */
type TradeQueryBase = {
  /** Most trades to return (Deribit's cap is 1000). */
  count?: number;
  /** `asc`, `desc` or `default`. */
  sorting?: 'asc' | 'desc' | 'default';
  /**
   * `live` (default) reads the main API; `history` reads
   * history.deribit.com, which keeps the full archive (production only).
   */
  source?: DeribitTradeSource;
};

/** Query for {@link Deribit.getLastTradesByCurrencyAndTime}. */
export type DeribitTradesByCurrencyAndTimeQuery = TradeQueryBase & {
  currency: string;
  kind?: DeribitKind | 'any';
  /** Unix ms, inclusive. */
  startTimestamp: number;
  /** Unix ms, inclusive. */
  endTimestamp: number;
};

/** Query for {@link Deribit.getLastTradesByInstrumentAndTime}. */
export type DeribitTradesByInstrumentAndTimeQuery = TradeQueryBase & {
  instrumentName: string;
  startTimestamp: number;
  endTimestamp: number;
};

/** Query for {@link Deribit.getLastTradesByCurrency}. */
export type DeribitTradesByCurrencyQuery = TradeQueryBase & {
  currency: string;
  kind?: DeribitKind | 'any';
  /** Trade id to start from (inclusive). */
  startId?: string;
  /** Trade id to stop at (inclusive). */
  endId?: string;
};

/** Query for {@link Deribit.getLastTradesByInstrument}. */
export type DeribitTradesByInstrumentQuery = TradeQueryBase & {
  instrumentName: string;
  /** Trade sequence to start from (inclusive). */
  startSeq?: number;
  /** Trade sequence to stop at (inclusive). */
  endSeq?: number;
};

/** Query for {@link Deribit.getVolatilityIndexData}. */
export type DeribitVolatilityIndexQuery = {
  currency: string;
  startTimestamp: number;
  endTimestamp: number;
  /** Candle size: seconds (`1`, `60`, `3600`, `43200`) or `1D`. */
  resolution: string | number;
};

/** A parameter value Deribit's GET interface accepts. */
export type DeribitParamValue = string | number | boolean;

/** Wire names for the camelCase query keys. */
const WIRE: Record<string, string> = {
  instrumentName: 'instrument_name',
  startTimestamp: 'start_timestamp',
  endTimestamp: 'end_timestamp',
  startId: 'start_id',
  endId: 'end_id',
  startSeq: 'start_seq',
  endSeq: 'end_seq',
  indexName: 'index_name',
};

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/** Deribit's expiry code for a timestamp: `1794038400000` → `7NOV26`. */
export function deribitExpiryCode(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getUTCDate()}${MONTHS[d.getUTCMonth()]}${
    String(d.getUTCFullYear()).slice(2)
  }`;
}

/**
 * Deribit REST client for public market data: instrument and option-chain
 * discovery, book summaries, tickers, order-book snapshots, historical
 * trades (including the history.deribit.com archive), the price index and
 * DVOL history.
 *
 * Responses keep every field, camelCased, and integers wider than 2^53
 * (`starbaseMatchId`, the nanosecond `starbaseTimestamp`) keep all their
 * digits as strings. For streaming data use `@tundraconnect/deribit/sockets`.
 *
 * @example
 * ```ts
 * import { Deribit } from '@tundraconnect/deribit';
 *
 * const deribit = new Deribit();
 * const chain = await deribit.getOptionChain({ currency: 'BTC', expiry: '7NOV26' });
 * const summaries = await deribit.getBookSummaryByCurrency({ currency: 'BTC', kind: 'option' });
 * console.log(chain.length, summaries[0]?.markIv);
 * ```
 */
export class Deribit extends RESTler<DeribitOptions & RESTlerOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Deribit';

  readonly #environment: DeribitEnvironment;

  /**
   * Creates a new Deribit REST client.
   *
   * @param options - Client configuration; everything is optional.
   * @throws {DeribitError} `CONFIG_INVALID_OPTION` for an unknown environment.
   */
  constructor(
    options: EventOptionKeys<DeribitOptions, RESTlerEvents> = {},
  ) {
    const environment = options.environment ?? 'production';
    if (!(environment in DERIBIT_REST_URLS)) {
      throw new DeribitError('CONFIG_INVALID_OPTION', {
        option: 'environment',
        reason: "expected 'production' or 'testnet'",
      });
    }
    const { environment: _e, ...rest } = options;
    super({
      ...rest,
      baseURL: options.baseURL ?? DERIBIT_REST_URLS[environment],
    }, {
      baseURL: DERIBIT_REST_URLS[environment],
      timeout: 30,
      contentType: 'JSON',
    });
    this.#environment = environment;
    this._responseHandler = (response) => this.__toError(response);
  }

  /** The environment this client talks to. */
  get environment(): DeribitEnvironment {
    return this.#environment;
  }

  /**
   * Calls any public method and returns the whole JSON-RPC envelope,
   * including the server's `usIn`/`usOut`/`usDiff` timing — for methods
   * this client doesn't wrap.
   *
   * @param method - e.g. `public/get_funding_rate_history`.
   * @param params - Method parameters, by Deribit's own names.
   * @throws {DeribitError} `INVALID_REQUEST` for a non-public method, or
   * any vendor/transport code.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const env = await deribit.call('public/get_currencies');
   * console.log(env.usDiff, env.result);
   * ```
   */
  public async call(
    method: string,
    params: Record<string, DeribitParamValue | undefined> = {},
  ): Promise<DeribitRpcEnvelopeSchema> {
    if (!/^public\/[a-z_]+$/.test(method)) {
      throw new DeribitError('INVALID_REQUEST', {
        reason: 'only public/* methods can be called over REST',
      });
    }
    return await this.__requestAndValidate(
      { path: `/${method}`, method: 'GET', query: this.__query(params) },
      DeribitRpcEnvelopeSchemaObject,
    );
  }

  /**
   * Instruments (`public/get_instruments`).
   *
   * @throws {DeribitError} `BAD_REQUEST` (e.g. an unknown currency),
   * `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or
   * `RESPONSE_ERROR`.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const futures = await deribit.getInstruments({ currency: 'BTC', kind: 'future' });
   * console.log(futures.map((i) => i.instrumentName));
   * ```
   */
  public async getInstruments(
    query: DeribitInstrumentsQuery,
  ): Promise<DeribitInstrumentSchema[]> {
    return await this.__result(
      'public/get_instruments',
      { ...query },
      Guardian.array(DeribitInstrumentSchemaObject),
    );
  }

  /**
   * One instrument (`public/get_instrument`).
   *
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const perp = await deribit.getInstrument('BTC-PERPETUAL');
   * console.log(perp.tickSize);
   * ```
   */
  public async getInstrument(
    instrumentName: string,
  ): Promise<DeribitInstrumentSchema> {
    return await this.__result(
      'public/get_instrument',
      { instrumentName },
      DeribitInstrumentSchemaObject,
    );
  }

  /**
   * Expiry codes per currency and kind (`public/get_expirations`), e.g.
   * `{ btc: { option: ['7NOV26', ...] } }`, exactly as Deribit sends it.
   *
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const exp = await deribit.getExpirations({ currency: 'BTC', kind: 'option' });
   * console.log(exp.btc?.option);
   * ```
   */
  public async getExpirations(
    query: { currency: string; kind: DeribitKind | 'any' },
  ): Promise<Record<string, Record<string, string[]>>> {
    return await this.__result(
      'public/get_expirations',
      { ...query },
      Guardian.unknown<Record<string, Record<string, string[]>>>().test(
        (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
        'expected { <currency>: { <kind>: [expiry, ...] } }',
      ),
    );
  }

  /**
   * The active option chain for a currency (`public/get_instruments` with
   * `kind: option`), optionally one expiry, in Deribit's order. Pair it
   * with {@link getBookSummaryByCurrency} or the socket's `ticker` channel
   * for marks, IVs and greeks.
   *
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const daily = await deribit.getOptionChain({ currency: 'BTC', expiry: '7NOV26' });
   * console.log(daily.map((o) => `${o.strike} ${o.optionType}`));
   * ```
   */
  public async getOptionChain(
    query: DeribitOptionChainQuery,
  ): Promise<DeribitInstrumentSchema[]> {
    const options = await this.getInstruments({
      currency: query.currency,
      kind: 'option',
    });
    const expiry = query.expiry;
    if (expiry === undefined) return options;
    return options.filter((o) =>
      typeof expiry === 'number'
        ? o.expirationTimestamp === expiry
        : o.instrumentName.split('-')[1] === expiry.toUpperCase()
    );
  }

  /**
   * Book summaries for every instrument of a currency
   * (`public/get_book_summary_by_currency`): bid/ask, mark price, mark IV,
   * underlying, volume and open interest.
   *
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const rows = await deribit.getBookSummaryByCurrency({ currency: 'ETH', kind: 'option' });
   * console.log(rows.filter((r) => r.markIv !== undefined).length);
   * ```
   */
  public async getBookSummaryByCurrency(
    query: { currency: string; kind?: DeribitKind },
  ): Promise<DeribitBookSummarySchema[]> {
    return await this.__result(
      'public/get_book_summary_by_currency',
      { ...query },
      Guardian.array(DeribitBookSummarySchemaObject),
    );
  }

  /**
   * Book summary for one instrument (`public/get_book_summary_by_instrument`).
   *
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const [perp] = await deribit.getBookSummaryByInstrument('BTC-PERPETUAL');
   * console.log(perp?.markPrice);
   * ```
   */
  public async getBookSummaryByInstrument(
    instrumentName: string,
  ): Promise<DeribitBookSummarySchema[]> {
    return await this.__result(
      'public/get_book_summary_by_instrument',
      { instrumentName },
      Guardian.array(DeribitBookSummarySchemaObject),
    );
  }

  /**
   * Ticker for one instrument (`public/ticker`): best bid/ask, mark price
   * and, for options, mark/bid/ask IV and greeks.
   *
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const t = await deribit.getTicker('BTC-PERPETUAL');
   * console.log(t.markPrice, t.currentFunding);
   * ```
   */
  public async getTicker(instrumentName: string): Promise<DeribitTickerSchema> {
    return await this.__result(
      'public/ticker',
      { instrumentName },
      DeribitTickerSchemaObject,
    );
  }

  /**
   * Order-book snapshot (`public/get_order_book`). Its `changeId` is the
   * same sequence the socket's `book` channel chains, so this is how to
   * rebuild a book after a `gap` event.
   *
   * @param query.depth - Levels per side (1, 5, 10, 20, 50, 100, 1000, 10000).
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const book = await deribit.getOrderBook({ instrumentName: 'BTC-PERPETUAL', depth: 10 });
   * console.log(book.changeId, book.bids[0]);
   * ```
   */
  public async getOrderBook(
    query: { instrumentName: string; depth?: number },
  ): Promise<DeribitOrderBookSchema> {
    return await this.__result(
      'public/get_order_book',
      { ...query },
      DeribitOrderBookSchemaObject,
    );
  }

  /**
   * Trades of a currency in a time window
   * (`public/get_last_trades_by_currency_and_time`). Page with
   * `hasMore` by moving the window.
   *
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const page = await deribit.getLastTradesByCurrencyAndTime({
   *   currency: 'BTC',
   *   kind: 'option',
   *   startTimestamp: Date.now() - 3_600_000,
   *   endTimestamp: Date.now(),
   *   count: 1000,
   *   sorting: 'asc',
   * });
   * console.log(page.trades.length, page.hasMore, page.trades[0]?.iv);
   * ```
   */
  public async getLastTradesByCurrencyAndTime(
    query: DeribitTradesByCurrencyAndTimeQuery,
  ): Promise<DeribitTradesPageSchema> {
    return await this.__trades(
      'public/get_last_trades_by_currency_and_time',
      query,
    );
  }

  /**
   * Trades of one instrument in a time window
   * (`public/get_last_trades_by_instrument_and_time`).
   *
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const page = await deribit.getLastTradesByInstrumentAndTime({
   *   instrumentName: 'BTC-PERPETUAL',
   *   startTimestamp: Date.now() - 60_000,
   *   endTimestamp: Date.now(),
   * });
   * console.log(page.trades.map((t) => t.tradeSeq));
   * ```
   */
  public async getLastTradesByInstrumentAndTime(
    query: DeribitTradesByInstrumentAndTimeQuery,
  ): Promise<DeribitTradesPageSchema> {
    return await this.__trades(
      'public/get_last_trades_by_instrument_and_time',
      query,
    );
  }

  /**
   * Latest trades of a currency, or a trade-id range
   * (`public/get_last_trades_by_currency`).
   *
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const page = await deribit.getLastTradesByCurrency({ currency: 'ETH', kind: 'option', count: 50 });
   * console.log(page.trades.length);
   * ```
   */
  public async getLastTradesByCurrency(
    query: DeribitTradesByCurrencyQuery,
  ): Promise<DeribitTradesPageSchema> {
    return await this.__trades('public/get_last_trades_by_currency', query);
  }

  /**
   * Latest trades of one instrument, or a trade-sequence range
   * (`public/get_last_trades_by_instrument`) — the way to backfill a
   * socket `gap` on a trades stream.
   *
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const missed = await deribit.getLastTradesByInstrument({
   *   instrumentName: 'BTC-PERPETUAL',
   *   startSeq: 315282657,
   *   endSeq: 315282660,
   *   sorting: 'asc',
   * });
   * console.log(missed.trades.map((t) => t.tradeSeq));
   * ```
   */
  public async getLastTradesByInstrument(
    query: DeribitTradesByInstrumentQuery,
  ): Promise<DeribitTradesPageSchema> {
    return await this.__trades('public/get_last_trades_by_instrument', query);
  }

  /**
   * Current value of a price index (`public/get_index_price`).
   *
   * @param indexName - e.g. `btc_usd`, `eth_usd`.
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const { indexPrice } = await deribit.getIndexPrice('btc_usd');
   * console.log(indexPrice);
   * ```
   */
  public async getIndexPrice(
    indexName: string,
  ): Promise<DeribitIndexPriceSchema> {
    return await this.__result(
      'public/get_index_price',
      { indexName },
      DeribitIndexPriceSchemaObject,
    );
  }

  /**
   * DVOL candles (`public/get_volatility_index_data`), as
   * `[timestamp, open, high, low, close]`. Follow `continuation` (pass it
   * as the next `endTimestamp`) for longer ranges.
   *
   * @throws {DeribitError} As {@link getInstruments}.
   *
   * @example
   * ```ts
   * import { Deribit } from '@tundraconnect/deribit';
   *
   * const deribit = new Deribit();
   * const dvol = await deribit.getVolatilityIndexData({
   *   currency: 'BTC',
   *   startTimestamp: Date.now() - 3_600_000,
   *   endTimestamp: Date.now(),
   *   resolution: 60,
   * });
   * console.log(dvol.data.at(-1));
   * ```
   */
  public async getVolatilityIndexData(
    query: DeribitVolatilityIndexQuery,
  ): Promise<DeribitVolatilityIndexDataSchema> {
    return await this.__result(
      'public/get_volatility_index_data',
      { ...query },
      DeribitVolatilityIndexDataSchemaObject,
    );
  }

  /**
   * JSON bodies are parsed losslessly: integers beyond 2^53 keep their
   * digits as strings (see `parseJsonLossless`).
   * @protected
   */
  protected override _parseResponseBody<B = ResponseBody>(
    body: string,
    contentType: string | null | undefined,
  ): B {
    if (body && (contentType ?? '').toLowerCase().includes('json')) {
      try {
        return parseJsonLossless(body) as B;
      } catch {
        // Fall through: RESTler returns malformed JSON as text.
      }
    }
    return super._parseResponseBody<B>(body, contentType);
  }

  /** Runs a trades query on the live or history host. */
  private async __trades(
    method: string,
    query: TradeQueryBase & Record<string, unknown>,
  ): Promise<DeribitTradesPageSchema> {
    const { source, ...params } = query;
    if (source === 'history' && this.#environment !== 'production') {
      throw new DeribitError('INVALID_REQUEST', {
        reason: 'history.deribit.com only serves production data',
      });
    }
    return await this.__result(
      method,
      params as Record<string, DeribitParamValue | undefined>,
      DeribitTradesPageSchemaObject,
      source === 'history' ? DERIBIT_HISTORY_URL : undefined,
    );
  }

  /** Calls `method` and validates its `result` against `guard`. */
  private async __result<B>(
    method: string,
    params: Record<string, unknown>,
    guard: BaseGuardian<B>,
    baseURL?: string,
  ): Promise<B> {
    const envelope = await this.__requestAndValidate(
      {
        path: `/${method}`,
        method: 'GET',
        query: this.__query(params),
        ...(baseURL && { baseURL }),
      },
      Guardian.object({ result: guard })
        .passthrough() as unknown as BaseGuardian<
          { result: B }
        >,
    );
    return envelope.result;
  }

  /** camelCase params → Deribit's query parameters. */
  private __query(params: Record<string, unknown>): Record<string, string> {
    const q: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (
        typeof value !== 'string' && typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        throw new DeribitError('INVALID_REQUEST', {
          reason: `${key} must be a string, number or boolean`,
        });
      }
      q[WIRE[key] ?? key] = String(value);
    }
    return q;
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
      return new DeribitError('RATE_LIMITED', {
        status: 429,
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new DeribitError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new DeribitError('NETWORK_ERROR', {}, err);
    }
    return err;
  }

  /**
   * Makes a request and validates its body against `guard`, rewrapping a
   * validation failure as `RESPONSE_ERROR`.
   *
   * @throws {DeribitError} `RESPONSE_ERROR`
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
        throw new DeribitError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler: a JSON-RPC `error` (Deribit sends it with
   * HTTP 400) becomes a {@link DeribitError} keyed by Deribit's code; any
   * other error status maps by status.
   *
   * @throws {DeribitError} `BAD_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`,
   * `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or `UNKNOWN_ERROR`.
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    const body = response.body as
      | { error?: { code?: unknown; message?: unknown; data?: unknown } }
      | undefined;
    const rpc = typeof body === 'object' && body !== null
      ? body.error
      : undefined;
    if (rpc && typeof rpc.code === 'number') {
      throw new DeribitError(deribitErrorCode(rpc.code), {
        status,
        vendorCode: rpc.code,
        vendorMessage: String(rpc.message ?? ''),
        vendorData: rpc.data,
        retryAfterSeconds: this._parseRetryAfter(response.headers),
      });
    }
    if (status === null || status < 400) return response.body;
    throw new DeribitError(
      status === 429
        ? 'RATE_LIMITED'
        : status === 401 || status === 403
        ? 'UNAUTHORIZED'
        : status === 404
        ? 'NOT_FOUND'
        : status >= 500
        ? 'SERVICE_UNAVAILABLE'
        : 'UNKNOWN_ERROR',
      {
        status,
        retryAfterSeconds: this._parseRetryAfter(response.headers),
      },
    );
  }
}
