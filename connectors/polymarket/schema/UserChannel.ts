import { type BaseGuardian, Guardian } from '@guardian';
import { camelizeKeys } from './camelizeKeys.ts';

/**
 * CLOB user-channel WebSocket messages
 * (`wss://ws-subscriptions-clob.polymarket.com/ws/user`) — the
 * authenticated account's own orders and trades. Keys are camelCased,
 * decimal strings become numbers, and every unmodelled field passes
 * through. A trade is re-sent as it moves MATCHED → MINED → CONFIRMED (or
 * RETRYING/FAILED); each of those messages is delivered — none are merged.
 */

const side = Guardian.enum(['BUY', 'SELL'] as const);
const optionalString = Guardian.string().optional();

/** An order placement, update (partial fill) or cancellation. */
export type PolymarketUserOrder = {
  eventType: 'order';
  /** Order id (hash). */
  id: string;
  /** Condition id. */
  market: string;
  assetId: string;
  side: 'BUY' | 'SELL';
  price: number;
  originalSize: number;
  sizeMatched: number;
  outcome?: string;
  /** `PLACEMENT` | `UPDATE` | `CANCELLATION`. */
  type: string;
  /** `LIVE` | `MATCHED` | `CANCELED` | ... */
  status?: string;
  orderType?: string;
  owner?: string;
  makerAddress?: string;
  /** Unix milliseconds. */
  timestamp: number;
};

/**
 * Schema for a user-channel `order` message.
 *
 * @example
 * ```typescript
 * import { PolymarketUserOrderSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, order] = PolymarketUserOrderSchemaObject.safeParse({
 *   event_type: 'order', id: '0x1', market: '0xabc', asset_id: '1', side: 'BUY',
 *   price: '0.52', original_size: '10', size_matched: '0', type: 'PLACEMENT',
 *   status: 'LIVE', timestamp: '1782753357257',
 * });
 * ```
 */
export const PolymarketUserOrderSchemaObject: BaseGuardian<
  PolymarketUserOrder
> = Guardian.preprocess(
  camelizeKeys,
  Guardian.object({
    eventType: Guardian.literal('order'),
    id: Guardian.string().minLength(1),
    market: Guardian.string(),
    assetId: Guardian.string(),
    side,
    price: Guardian.number(),
    originalSize: Guardian.number(),
    sizeMatched: Guardian.number(),
    outcome: optionalString,
    type: Guardian.string(),
    status: optionalString,
    orderType: optionalString,
    owner: optionalString,
    makerAddress: optionalString,
    timestamp: Guardian.number(),
  }).passthrough().describe({
    title: 'User-channel order',
    description: 'An order placement, update or cancellation for this account.',
  }),
);

/** A trade involving this account, at one point in its on-chain lifecycle. */
export type PolymarketUserTrade = {
  eventType: 'trade';
  /** Trade id. */
  id: string;
  takerOrderId?: string;
  market: string;
  assetId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  feeRateBps?: number;
  /** `MATCHED` | `MATCHED_NOT_BROADCASTED` | `MINED` | `CONFIRMED` | `RETRYING` | `FAILED`. */
  status: string;
  /** Unix seconds. */
  matchTime?: number;
  /** Unix seconds. */
  lastUpdate?: number;
  outcome?: string;
  /** `TAKER` | `MAKER`. */
  traderSide?: string;
  transactionHash?: string;
  /** The resting orders matched, camelCased, every field kept. */
  makerOrders: Record<string, unknown>[];
  /** Unix milliseconds. */
  timestamp: number;
};

/**
 * Schema for a user-channel `trade` message. `transaction_hash: null`
 * (before the trade is mined) normalizes to an absent `transactionHash`.
 *
 * @example
 * ```typescript
 * import { PolymarketUserTradeSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, trade] = PolymarketUserTradeSchemaObject.safeParse({
 *   event_type: 'trade', id: 't1', market: '0xabc', asset_id: '1', side: 'BUY',
 *   size: '10', price: '0.52', status: 'MATCHED', maker_orders: [],
 *   timestamp: '1782753357257',
 * });
 * ```
 */
export const PolymarketUserTradeSchemaObject: BaseGuardian<
  PolymarketUserTrade
> = Guardian.preprocess(
  (raw: unknown) => {
    const o = camelizeKeys(raw);
    if (typeof o !== 'object' || o === null) return o;
    const r = { ...(o as Record<string, unknown>) };
    for (const key of ['transactionHash', 'takerOrderId', 'outcome']) {
      if (r[key] === null) delete r[key];
    }
    r.makerOrders ??= [];
    return r;
  },
  Guardian.object({
    eventType: Guardian.literal('trade'),
    id: Guardian.string().minLength(1),
    takerOrderId: optionalString,
    market: Guardian.string(),
    assetId: Guardian.string(),
    side,
    size: Guardian.number(),
    price: Guardian.number(),
    feeRateBps: Guardian.number().optional(),
    status: Guardian.string(),
    matchTime: Guardian.number().optional(),
    lastUpdate: Guardian.number().optional(),
    outcome: optionalString,
    traderSide: optionalString,
    transactionHash: optionalString,
    makerOrders: Guardian.array(Guardian.object({}).passthrough()),
    timestamp: Guardian.number(),
  }).passthrough().describe({
    title: 'User-channel trade',
    description: 'A trade involving this account at one lifecycle status.',
  }),
);
