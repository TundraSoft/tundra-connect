/**
 * Guardian schemas behind `@tundraconnect/binance`: the spot market-data
 * stream payloads, each exported as a schema object with its inferred
 * TypeScript type. Use them to validate stored or forwarded payloads, or to
 * type your own code against the socket's events.
 *
 * @example
 * ```ts
 * import { BinanceTradeSchemaObject } from '@tundraconnect/binance/schemas';
 *
 * declare const payload: unknown; // e.g. a recorded `@trade` frame's `data`
 * const [error, trade] = BinanceTradeSchemaObject.safeParse(payload);
 * if (error) console.error(error.message);
 * else console.log(trade.price, trade.quantity);
 * ```
 *
 * @module
 */

export {
  type BinanceBookTicker,
  BinanceBookTickerSchemaObject,
  type BinanceDepthLevel,
  type BinanceDepthUpdate,
  BinanceDepthUpdateSchemaObject,
  type BinanceTrade,
  BinanceTradeSchemaObject,
} from './MarketData.ts';
