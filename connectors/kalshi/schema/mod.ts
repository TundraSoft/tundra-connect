/**
 * Guardian schemas behind `@tundraconnect/kalshi`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { MarketSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = MarketSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  type Event,
  EventSchemaObject,
  type EventsPage,
  EventsPageSchemaObject,
  SingleEventSchemaObject,
} from './Event.ts';

export { type ExchangeStatus, ExchangeStatusSchemaObject } from './Exchange.ts';

export {
  type GetMarketsQuery,
  isSettledStatus,
  type Market,
  MarketSchemaObject,
  type MarketsPage,
  MarketsPageSchemaObject,
  SingleMarketSchemaObject,
} from './Market.ts';

export {
  type BatchOrderRow,
  BatchOrderRowSchemaObject,
  type BatchOrdersResponse,
  BatchOrdersResponseSchemaObject,
  type CancelAck,
  CancelAckSchemaObject,
  type Order,
  type OrderAck,
  OrderAckSchemaObject,
  type OrderError,
  OrderErrorSchemaObject,
  OrderSchemaObject,
  type OrdersPage,
  OrdersPageSchemaObject,
  SingleOrderSchemaObject,
} from './Order.ts';

export {
  type Orderbook,
  type OrderbookLevel,
  OrderbookSchemaObject,
} from './Orderbook.ts';

export {
  type Balance,
  BalanceSchemaObject,
  type EventPosition,
  EventPositionSchemaObject,
  type Fill,
  FillSchemaObject,
  type FillsPage,
  FillsPageSchemaObject,
  type MarketPosition,
  MarketPositionSchemaObject,
  type PositionsPage,
  PositionsPageSchemaObject,
} from './Portfolio.ts';

export {
  type Series,
  type SeriesListResponse,
  SeriesListResponseSchemaObject,
  SeriesSchemaObject,
  SingleSeriesSchemaObject,
} from './Series.ts';

export {
  type Trade,
  TradeSchemaObject,
  type TradesPage,
  TradesPageSchemaObject,
} from './Trade.ts';
