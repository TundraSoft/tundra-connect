/**
 * Guardian schemas behind `@tundraconnect/polymarket`: every request and
 * response shape the client validates, each exported as a schema object with
 * its inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { ClobOrderBookSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = ClobOrderBookSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  type ClobApiCredentials,
  ClobApiCredentialsSchemaObject,
  type ClobBalance,
  ClobBalanceSchemaObject,
  type ClobNegRisk,
  ClobNegRiskSchemaObject,
  type ClobTickSize,
  ClobTickSizeSchemaObject,
  type ClobVersion,
  ClobVersionSchemaObject,
} from './ClobAccount.ts';
export {
  type ClobCancelResponse,
  ClobCancelResponseSchemaObject,
  type ClobPostOrderResponse,
  ClobPostOrderResponseSchemaObject,
  type ClobPostOrdersResponse,
  ClobPostOrdersResponseSchemaObject,
} from './ClobOrder.ts';
export {
  type ClobOpenOrder,
  ClobOpenOrderSchemaObject,
  type ClobOpenOrdersPage,
  ClobOpenOrdersPageSchemaObject,
  type ClobOrderBook,
  type ClobOrderBookLevel,
  ClobOrderBookSchemaObject,
  type ClobTrade,
  ClobTradeSchemaObject,
  type ClobTradesPage,
  ClobTradesPageSchemaObject,
} from './ClobData.ts';
export {
  type DataPosition,
  type DataPositionList,
  DataPositionListSchemaObject,
  DataPositionSchemaObject,
  type DataValue,
  type DataValueList,
  DataValueListSchemaObject,
} from './DataApi.ts';
export {
  type FeeSchedule,
  FeeScheduleSchemaObject,
  type GammaMarket,
  type GammaMarketKeysetPage,
  GammaMarketKeysetPageSchemaObject,
  type GammaMarketList,
  GammaMarketListSchemaObject,
  GammaMarketSchemaObject,
} from './GammaMarket.ts';
export {
  type RelayerSubmitResponse,
  RelayerSubmitResponseSchemaObject,
  type RelayPayload,
  RelayPayloadSchemaObject,
} from './Relayer.ts';
