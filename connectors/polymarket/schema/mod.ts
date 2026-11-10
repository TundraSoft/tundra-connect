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
  type DataActivity,
  type DataActivityPage,
  DataActivityPageSchemaObject,
  DataActivitySchemaObject,
  type DataPagination,
  DataPaginationSchemaObject,
  type DataPosition,
  DataPositionSchemaObject,
  type DataPositionsPage,
  DataPositionsPageSchemaObject,
  type DataResolution,
  type DataResolutionList,
  DataResolutionListSchemaObject,
  type DataToken,
  type DataTokenList,
  DataTokenListSchemaObject,
  type DataTrade,
  DataTradeSchemaObject,
  type DataTradesPage,
  DataTradesPageSchemaObject,
  type DataValue,
  DataValueSchemaObject,
} from './DataApi.ts';
export {
  type CryptoMarketConfig,
  CryptoMarketConfigSchemaObject,
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
  type RelayerTransaction,
  RelayerTransactionSchemaObject,
  type RelayPayload,
  RelayPayloadSchemaObject,
} from './Relayer.ts';

// WebSocket feeds (`./sockets`).
export {
  type PolymarketBestBidAsk,
  PolymarketBestBidAskSchemaObject,
  type PolymarketBook,
  type PolymarketBookLevel,
  PolymarketBookSchemaObject,
  type PolymarketLastTradePrice,
  PolymarketLastTradePriceSchemaObject,
  type PolymarketMarketResolved,
  PolymarketMarketResolvedSchemaObject,
  type PolymarketNewMarket,
  PolymarketNewMarketSchemaObject,
  type PolymarketPriceChange,
  type PolymarketPriceChangeEntry,
  PolymarketPriceChangeSchemaObject,
  type PolymarketTickSizeChange,
  PolymarketTickSizeChangeSchemaObject,
} from './MarketChannel.ts';
export {
  type PolymarketUserOrder,
  PolymarketUserOrderSchemaObject,
  type PolymarketUserTrade,
  PolymarketUserTradeSchemaObject,
} from './UserChannel.ts';
export {
  type PolymarketMarketStatus,
  type PolymarketPriceBestBidAsk,
  PolymarketPriceBestBidAskSchemaObject,
  type PolymarketPriceEnvelope,
  PolymarketPriceEnvelopeSchemaObject,
  type PolymarketPricePoint,
  type PolymarketPriceSnapshot,
  PolymarketPriceSnapshotSchemaObject,
  type PolymarketPriceUpdate,
  PolymarketPriceUpdateSchemaObject,
} from './PriceChannel.ts';
