/**
 * Guardian schemas behind `@tundraconnect/deribit`: instruments, book
 * summaries, trades, tickers (mark IV, greeks), order books, DVOL, price
 * indices, option mark prices and the JSON-RPC envelope. Every schema
 * takes Deribit's raw snake_case payload and yields camelCased keys,
 * keeping every field.
 *
 * @example
 * ```ts
 * import { DeribitTickerSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * declare const recorded: unknown; // e.g. a stored ticker notification
 * const [error, ticker] = DeribitTickerSchemaObject.safeParse(recorded);
 * if (error) console.error(error.message);
 * else console.log(ticker.markIv);
 * ```
 *
 * @module
 */

export {
  type DeribitBookSummarySchema,
  DeribitBookSummarySchemaObject,
  type DeribitInstrumentSchema,
  DeribitInstrumentSchemaObject,
} from './Instrument.ts';

export {
  type DeribitTradeSchema,
  DeribitTradeSchemaObject,
  type DeribitTradesPageSchema,
  DeribitTradesPageSchemaObject,
} from './Trade.ts';

export {
  type DeribitGreeksSchema,
  type DeribitTickerSchema,
  DeribitTickerSchemaObject,
  type DeribitTickerStatsSchema,
} from './Ticker.ts';

export {
  type DeribitBookLevelChangeSchema,
  type DeribitBookLevelSchema,
  type DeribitBookUpdateSchema,
  DeribitBookUpdateSchemaObject,
  type DeribitOrderBookSchema,
  DeribitOrderBookSchemaObject,
} from './OrderBook.ts';

export {
  type DeribitIndexPriceSchema,
  DeribitIndexPriceSchemaObject,
  type DeribitMarkPriceSchema,
  DeribitMarkPriceSchemaObject,
  type DeribitPriceIndexSchema,
  DeribitPriceIndexSchemaObject,
  type DeribitVolatilityCandleSchema,
  type DeribitVolatilityIndexDataSchema,
  DeribitVolatilityIndexDataSchemaObject,
  type DeribitVolatilityIndexSchema,
  DeribitVolatilityIndexSchemaObject,
} from './Index.ts';

export {
  type DeribitAuthResultSchema,
  DeribitAuthResultSchemaObject,
  type DeribitRpcEnvelopeSchema,
  DeribitRpcEnvelopeSchemaObject,
  type DeribitRpcErrorSchema,
  DeribitRpcErrorSchemaObject,
} from './Rpc.ts';
