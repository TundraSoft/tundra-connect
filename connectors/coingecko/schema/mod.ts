/**
 * Guardian schemas behind `@tundraconnect/coingecko`: every request and
 * response shape the client validates, each exported as a schema object with
 * its inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { MarketsSchemaObject } from '@tundraconnect/coingecko/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = MarketsSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  coinIdGuard,
  coinNameGuard,
  coinSymbolGuard,
  type RoiSchema,
  RoiSchemaObject,
} from './Common.ts';

export {
  type ErrorEnvelopeSchema,
  ErrorEnvelopeSchemaObject,
} from './Error.ts';

export { type PriceSchema, PriceSchemaObject } from './Price.ts';

export {
  type CoinListEntrySchema,
  CoinListEntrySchemaObject,
  type CoinListSchema,
  CoinListSchemaObject,
} from './CoinList.ts';

export {
  type MarketDataSchema,
  MarketDataSchemaObject,
  type MarketsSchema,
  MarketsSchemaObject,
} from './Markets.ts';
