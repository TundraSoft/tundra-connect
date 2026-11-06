/**
 * Typed, cross-runtime client for [Deribit](https://docs.deribit.com/)
 * market data: option-chain discovery, book summaries, tickers, order-book
 * snapshots and historical trades over REST, and a JSON-RPC WebSocket feed
 * (`./sockets`) of order books with `change_id` gap detection, trades,
 * tickers with mark IV and greeks, DVOL, price indices and option mark
 * prices. Integers wider than 2^53 keep their exact digits.
 *
 * Subpaths: `./sockets` (the WebSocket feed, loadable without the REST
 * client), `./schemas` (Guardian schemas and inferred types) and
 * `./errors` (`DeribitError` and its code registry).
 *
 * @example
 * ```ts
 * import { Deribit } from '@tundraconnect/deribit';
 *
 * const deribit = new Deribit();
 * const [expiry] = (await deribit.getExpirations({ currency: 'BTC', kind: 'option' })).btc?.option ?? [];
 * const chain = await deribit.getOptionChain({ currency: 'BTC', expiry });
 * console.log(expiry, chain.length);
 * ```
 *
 * @module
 */

export {
  Deribit,
  DERIBIT_HISTORY_URL,
  DERIBIT_REST_URLS,
  type DeribitEnvironment,
  deribitExpiryCode,
  type DeribitInstrumentsQuery,
  type DeribitKind,
  type DeribitOptionChainQuery,
  type DeribitOptions,
  type DeribitParamValue,
  type DeribitTradesByCurrencyAndTimeQuery,
  type DeribitTradesByCurrencyQuery,
  type DeribitTradesByInstrumentAndTimeQuery,
  type DeribitTradesByInstrumentQuery,
  type DeribitTradeSource,
  type DeribitVolatilityIndexQuery,
} from './Deribit.ts';

export { parseJsonLossless } from './json.ts';

export * from './socket/mod.ts';

export * from './errors/mod.ts';

export * from './schema/mod.ts';
