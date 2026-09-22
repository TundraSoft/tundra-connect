import { type BaseGuardian, Guardian } from '@guardian';

/** One order-submission/batch-row failure, Kalshi's documented error envelope. */
export type OrderError = {
  code: string;
  message: string;
  details?: unknown;
};

export const OrderErrorSchemaObject: BaseGuardian<OrderError> = Guardian
  .object({
    code: Guardian.string(),
    message: Guardian.string(),
    details: Guardian.unknown().optional(),
  }).describe({
    title: 'Kalshi order error',
    description:
      'Per-order failure detail, either thrown whole or nested in a batch row.',
  });

/**
 * Response of `POST /portfolio/events/orders` (create) and
 * `POST /portfolio/events/orders/{id}/amend` — flat, no nesting. An order
 * is active immediately on creation, so there is no status enum here; see
 * {@link Order} for the richer list/get shape that does carry one.
 */
export type OrderAck = {
  orderId: string;
  clientOrderId?: string;
  /** Contracts filled immediately. */
  fillCount?: number;
  remainingCount?: number;
  /** Present only when `fillCount > 0`. */
  averageFillPrice?: number;
  averageFeePaid?: number;
  /** Matching-engine timestamp, Unix ms. */
  tsMs?: number;
};

const RENAME_ACK: Record<string, string> = {
  order_id: 'orderId',
  client_order_id: 'clientOrderId',
  fill_count: 'fillCount',
  remaining_count: 'remainingCount',
  average_fill_price: 'averageFillPrice',
  average_fee_paid: 'averageFeePaid',
  ts_ms: 'tsMs',
};

/**
 * Renames every snake_case wire field to its camelCase {@link OrderAck}
 * name. Numeric fixed-point strings are left as-is — `Guardian.number()`
 * coerces them below, and (unlike a hand-rolled `Number(x)`) correctly
 * rejects `''`/`null` instead of silently producing `0` (which would
 * otherwise poison a real fill's `actualPrice`/`slippage` in `Kalshi.ts`).
 */
function normalizeAck(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const out: Record<string, unknown> = {};
  for (
    const [wireKey, value] of Object.entries(raw as Record<string, unknown>)
  ) {
    out[RENAME_ACK[wireKey] ?? wireKey] = value;
  }
  return out;
}

const _orderAck = Guardian.object({
  orderId: Guardian.string().minLength(1),
  clientOrderId: Guardian.string().optional(),
  fillCount: Guardian.number().optional(),
  remainingCount: Guardian.number().optional(),
  averageFillPrice: Guardian.number().optional(),
  averageFeePaid: Guardian.number().optional(),
  tsMs: Guardian.number().optional(),
}).passthrough().describe({
  title: 'Kalshi order ack',
  description:
    'Create/amend response — the order is already active, no status field.',
});

/**
 * Schema for the create-order and amend-order response.
 *
 * @example
 * ```typescript
 * import { OrderAckSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, ack] = OrderAckSchemaObject.safeParse({
 *   order_id: 'o1', fill_count: '3.00', remaining_count: '0.00', ts_ms: 1700000000123,
 * });
 * ```
 */
export const OrderAckSchemaObject: BaseGuardian<OrderAck> = Guardian.preprocess(
  normalizeAck,
  _orderAck,
);

/** Response of `DELETE /portfolio/events/orders/{id}` (cancel) — distinct shape from {@link OrderAck}: `reducedBy`, no fill/remaining. */
export type CancelAck = {
  orderId: string;
  clientOrderId?: string;
  /** Contracts canceled. */
  reducedBy: number;
  tsMs?: number;
};

const RENAME_CANCEL_ACK: Record<string, string> = {
  order_id: 'orderId',
  client_order_id: 'clientOrderId',
  reduced_by: 'reducedBy',
  ts_ms: 'tsMs',
};

function normalizeCancelAck(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const out: Record<string, unknown> = {};
  for (
    const [wireKey, value] of Object.entries(raw as Record<string, unknown>)
  ) {
    out[RENAME_CANCEL_ACK[wireKey] ?? wireKey] = value;
  }
  return out;
}

const _cancelAck = Guardian.object({
  orderId: Guardian.string().minLength(1),
  clientOrderId: Guardian.string().optional(),
  reducedBy: Guardian.number(),
  tsMs: Guardian.number().optional(),
}).passthrough().describe({
  title: 'Kalshi cancel ack',
  description:
    'Cancel-order response — reports contracts reduced, not a fill/remaining pair.',
});

/**
 * Schema for the cancel-order response.
 *
 * @example
 * ```typescript
 * import { CancelAckSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, ack] = CancelAckSchemaObject.safeParse({
 *   order_id: 'o1', reduced_by: '10.00', ts_ms: 1715793660456,
 * });
 * ```
 */
export const CancelAckSchemaObject: BaseGuardian<CancelAck> = Guardian
  .preprocess(normalizeCancelAck, _cancelAck);

/**
 * One order from `GET /portfolio/orders` / `GET /portfolio/orders/{id}` —
 * the rich list/status surface, unlike the flat {@link OrderAck}. Legacy
 * `side`/`action` fields are deprecated in favor of `outcomeSide`
 * (yes/no) + `bookSide` (bid/ask).
 */
export type Order = {
  orderId: string;
  userId?: string;
  clientOrderId?: string;
  ticker: string;
  outcomeSide?: string;
  bookSide?: string;
  type?: string;
  /** `resting` | `canceled` | `executed`. */
  status: string;
  yesPrice?: number;
  noPrice?: number;
  fillCount?: number;
  remainingCount?: number;
  initialCount?: number;
  takerFees?: number;
  makerFees?: number;
  takerFillCost?: number;
  makerFillCost?: number;
  expirationTime?: string | null;
  createdTime?: string | null;
  lastUpdateTime?: string | null;
  selfTradePreventionType?: string | null;
  orderGroupId?: string | null;
  cancelOrderOnPause?: boolean;
};

const RENAME_ORDER: Record<string, string> = {
  order_id: 'orderId',
  user_id: 'userId',
  client_order_id: 'clientOrderId',
  ticker: 'ticker',
  outcome_side: 'outcomeSide',
  book_side: 'bookSide',
  type: 'type',
  status: 'status',
  yes_price_dollars: 'yesPrice',
  no_price_dollars: 'noPrice',
  fill_count_fp: 'fillCount',
  remaining_count_fp: 'remainingCount',
  initial_count_fp: 'initialCount',
  taker_fees_dollars: 'takerFees',
  maker_fees_dollars: 'makerFees',
  taker_fill_cost_dollars: 'takerFillCost',
  maker_fill_cost_dollars: 'makerFillCost',
  expiration_time: 'expirationTime',
  created_time: 'createdTime',
  last_update_time: 'lastUpdateTime',
  self_trade_prevention_type: 'selfTradePreventionType',
  order_group_id: 'orderGroupId',
  cancel_order_on_pause: 'cancelOrderOnPause',
};

function normalizeOrder(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const out: Record<string, unknown> = {};
  for (
    const [wireKey, value] of Object.entries(raw as Record<string, unknown>)
  ) {
    out[RENAME_ORDER[wireKey] ?? wireKey] = value;
  }
  return out;
}

const _order = Guardian.object({
  orderId: Guardian.string().minLength(1),
  userId: Guardian.string().optional(),
  clientOrderId: Guardian.string().optional(),
  ticker: Guardian.string(),
  outcomeSide: Guardian.string().optional(),
  bookSide: Guardian.string().optional(),
  type: Guardian.string().optional(),
  status: Guardian.string(),
  yesPrice: Guardian.number().optional(),
  noPrice: Guardian.number().optional(),
  fillCount: Guardian.number().optional(),
  remainingCount: Guardian.number().optional(),
  initialCount: Guardian.number().optional(),
  takerFees: Guardian.number().optional(),
  makerFees: Guardian.number().optional(),
  takerFillCost: Guardian.number().optional(),
  makerFillCost: Guardian.number().optional(),
  expirationTime: Guardian.string().nullable().optional(),
  createdTime: Guardian.string().nullable().optional(),
  lastUpdateTime: Guardian.string().nullable().optional(),
  selfTradePreventionType: Guardian.string().nullable().optional(),
  orderGroupId: Guardian.string().nullable().optional(),
  cancelOrderOnPause: Guardian.boolean().optional(),
}).passthrough().describe({
  title: 'Kalshi order',
  description: 'One order as returned by the list/get order-status surface.',
});

/**
 * Schema for one order from `GET /portfolio/orders` /
 * `GET /portfolio/orders/{id}`.
 *
 * @example
 * ```typescript
 * import { OrderSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, order] = OrderSchemaObject.safeParse({
 *   order_id: 'o1', ticker: 'T', status: 'resting', book_side: 'bid',
 * });
 * ```
 */
export const OrderSchemaObject: BaseGuardian<Order> = Guardian.preprocess(
  normalizeOrder,
  _order,
);

/** Response shape for `GET /portfolio/orders/{id}` — wraps the order as `{ "order": ... }`. */
export const SingleOrderSchemaObject: BaseGuardian<Order> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return obj.order ?? obj;
    },
    OrderSchemaObject,
  );

/** One page of `GET /portfolio/orders`. */
export type OrdersPage = {
  orders: Order[];
  cursor?: string;
};

const _ordersPage = Guardian.object({
  orders: Guardian.array(OrderSchemaObject),
  cursor: Guardian.string().optional(),
}).describe({
  title: 'Kalshi orders page',
  description: 'A cursor-paginated page of the account’s orders.',
});

/**
 * Schema for the `GET /portfolio/orders` response.
 *
 * @example
 * ```typescript
 * import { OrdersPageSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, page] = OrdersPageSchemaObject.safeParse({ orders: [] });
 * ```
 */
export const OrdersPageSchemaObject: BaseGuardian<OrdersPage> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return { orders: obj.orders ?? [], cursor: obj.cursor };
    },
    _ordersPage,
  );

/**
 * One row of a batch create/cancel response — EITHER the success fields
 * (an {@link OrderAck}/{@link CancelAck}-shaped row) OR an `error` object;
 * never both. `orderId` is present on both outcomes so a caller can always
 * correlate a row back to its request.
 */
export type BatchOrderRow = {
  orderId?: string;
  clientOrderId?: string;
  fillCount?: number;
  remainingCount?: number;
  averageFillPrice?: number;
  averageFeePaid?: number;
  reducedBy?: number;
  tsMs?: number;
  error?: OrderError;
};

const RENAME_BATCH_ROW: Record<string, string> = {
  ...RENAME_ACK,
  ...RENAME_CANCEL_ACK,
};

function normalizeBatchRow(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const out: Record<string, unknown> = {};
  for (
    const [wireKey, value] of Object.entries(raw as Record<string, unknown>)
  ) {
    out[RENAME_BATCH_ROW[wireKey] ?? wireKey] = value;
  }
  return out;
}

const _batchOrderRow = Guardian.object({
  orderId: Guardian.string().optional(),
  clientOrderId: Guardian.string().optional(),
  fillCount: Guardian.number().optional(),
  remainingCount: Guardian.number().optional(),
  averageFillPrice: Guardian.number().optional(),
  averageFeePaid: Guardian.number().optional(),
  reducedBy: Guardian.number().optional(),
  tsMs: Guardian.number().optional(),
  error: OrderErrorSchemaObject.optional(),
}).passthrough().describe({
  title: 'Kalshi batch order row',
  description:
    'One row of a batch create/cancel response — success fields or an error, never both.',
});

/**
 * Schema for one row of `POST /portfolio/events/orders/batched` or
 * `DELETE /portfolio/events/orders/batched`.
 *
 * @example
 * ```typescript
 * import { BatchOrderRowSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, row] = BatchOrderRowSchemaObject.safeParse({
 *   order_id: 'a', error: { code: 'bad', message: 'nope' },
 * });
 * ```
 */
export const BatchOrderRowSchemaObject: BaseGuardian<BatchOrderRow> = Guardian
  .preprocess(normalizeBatchRow, _batchOrderRow);

/** Response shape shared by both batch endpoints: `{ "orders": [<row>, ...] }`. */
export type BatchOrdersResponse = {
  orders: BatchOrderRow[];
};

const _batchOrdersResponse = Guardian.object({
  orders: Guardian.array(BatchOrderRowSchemaObject),
}).describe({
  title: 'Kalshi batch orders response',
  description: 'Per-row results for a batch create or batch cancel call.',
});

/**
 * Schema for the batch create/cancel response.
 *
 * @example
 * ```typescript
 * import { BatchOrdersResponseSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, result] = BatchOrdersResponseSchemaObject.safeParse({ orders: [] });
 * ```
 */
export const BatchOrdersResponseSchemaObject: BaseGuardian<
  BatchOrdersResponse
> = Guardian.preprocess(
  (raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const obj = raw as Record<string, unknown>;
    return { orders: obj.orders ?? [] };
  },
  _batchOrdersResponse,
);
