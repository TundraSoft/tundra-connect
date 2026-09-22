import { type BaseGuardian, Guardian } from '@guardian';

/** `GET /portfolio/balance` response. */
export type Balance = {
  /** Available balance, cents. */
  balance: number;
  /** Available balance, dollars — same value as `balance`, just decimal-formatted by the vendor. */
  balanceDollars?: number;
  /** Portfolio value (balance + positions marked to market), cents. */
  portfolioValue?: number;
  /** Unix seconds. */
  updatedTs?: number;
};

const RENAME_BALANCE: Record<string, string> = {
  balance: 'balance',
  balance_dollars: 'balanceDollars',
  portfolio_value: 'portfolioValue',
  updated_ts: 'updatedTs',
};

const _balance = Guardian.object({
  balance: Guardian.number(),
  balanceDollars: Guardian.number().optional(),
  portfolioValue: Guardian.number().optional(),
  updatedTs: Guardian.number().optional(),
}).passthrough().describe({
  title: 'Kalshi balance',
  description: 'Available balance and portfolio value.',
});

/**
 * Schema for the `GET /portfolio/balance` response.
 *
 * @example
 * ```typescript
 * import { BalanceSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, balance] = BalanceSchemaObject.safeParse({ balance: 10000 });
 * ```
 */
export const BalanceSchemaObject: BaseGuardian<Balance> = Guardian.preprocess(
  normalizeWith(RENAME_BALANCE),
  _balance,
);

/** One market-level position. */
export type MarketPosition = {
  ticker: string;
  /** Net contracts. Negative = NO side, positive = YES. */
  position?: number;
  totalTraded?: number;
  marketExposure?: number;
  realizedPnl?: number;
  feesPaid?: number;
};

/** One event-level position (aggregated across the event's markets). */
export type EventPosition = {
  eventTicker: string;
  eventExposure?: number;
  realizedPnl?: number;
  feesPaid?: number;
};

const RENAME_MARKET_POSITION: Record<string, string> = {
  ticker: 'ticker',
  position_fp: 'position',
  total_traded_dollars: 'totalTraded',
  market_exposure_dollars: 'marketExposure',
  realized_pnl_dollars: 'realizedPnl',
  fees_paid_dollars: 'feesPaid',
};

const RENAME_EVENT_POSITION: Record<string, string> = {
  event_ticker: 'eventTicker',
  event_exposure_dollars: 'eventExposure',
  realized_pnl_dollars: 'realizedPnl',
  fees_paid_dollars: 'feesPaid',
};

/**
 * Renames every snake_case wire field per `map` to its camelCase name.
 * Numeric fixed-point strings are left as-is — `Guardian.number()`
 * coerces them in the schema itself, and (unlike a hand-rolled
 * `Number(x)`) correctly rejects `''`/`null` instead of silently
 * producing `0`.
 */
function normalizeWith(map: Record<string, string>) {
  return (raw: unknown): unknown => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const out: Record<string, unknown> = {};
    for (
      const [wireKey, value] of Object.entries(raw as Record<string, unknown>)
    ) {
      out[map[wireKey] ?? wireKey] = value;
    }
    return out;
  };
}

const _marketPosition = Guardian.object({
  ticker: Guardian.string().minLength(1),
  position: Guardian.number().optional(),
  totalTraded: Guardian.number().optional(),
  marketExposure: Guardian.number().optional(),
  realizedPnl: Guardian.number().optional(),
  feesPaid: Guardian.number().optional(),
}).passthrough().describe({
  title: 'Kalshi market position',
  description: 'Net contracts held and P&L for one market.',
});

/**
 * Schema for one entry of `GET /portfolio/positions`'s `market_positions`.
 *
 * @example
 * ```typescript
 * import { MarketPositionSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, position] = MarketPositionSchemaObject.safeParse({
 *   ticker: 'T', position_fp: '5.00',
 * });
 * ```
 */
export const MarketPositionSchemaObject: BaseGuardian<MarketPosition> = Guardian
  .preprocess(normalizeWith(RENAME_MARKET_POSITION), _marketPosition);

const _eventPosition = Guardian.object({
  eventTicker: Guardian.string().minLength(1),
  eventExposure: Guardian.number().optional(),
  realizedPnl: Guardian.number().optional(),
  feesPaid: Guardian.number().optional(),
}).passthrough().describe({
  title: 'Kalshi event position',
  description: 'Exposure and P&L aggregated across one event’s markets.',
});

/**
 * Schema for one entry of `GET /portfolio/positions`'s `event_positions`.
 *
 * @example
 * ```typescript
 * import { EventPositionSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, position] = EventPositionSchemaObject.safeParse({
 *   event_ticker: 'E', event_exposure_dollars: '12.50',
 * });
 * ```
 */
export const EventPositionSchemaObject: BaseGuardian<EventPosition> = Guardian
  .preprocess(normalizeWith(RENAME_EVENT_POSITION), _eventPosition);

/** `GET /portfolio/positions` response. */
export type PositionsPage = {
  marketPositions: MarketPosition[];
  eventPositions: EventPosition[];
  cursor?: string;
};

const _positionsPage = Guardian.object({
  marketPositions: Guardian.array(MarketPositionSchemaObject),
  eventPositions: Guardian.array(EventPositionSchemaObject),
  cursor: Guardian.string().optional(),
}).describe({
  title: 'Kalshi positions page',
  description:
    'A cursor-paginated page of the account’s market and event positions.',
});

/**
 * Schema for the `GET /portfolio/positions` response.
 *
 * @example
 * ```typescript
 * import { PositionsPageSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, page] = PositionsPageSchemaObject.safeParse({});
 * ```
 */
export const PositionsPageSchemaObject: BaseGuardian<PositionsPage> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return {
        marketPositions: obj.market_positions ?? [],
        eventPositions: obj.event_positions ?? [],
        cursor: obj.cursor,
      };
    },
    _positionsPage,
  );

/** One execution from `GET /portfolio/fills`. */
export type Fill = {
  fillId: string;
  orderId?: string;
  ticker?: string;
  outcomeSide?: string;
  bookSide?: string;
  count?: number;
  yesPrice?: number;
  noPrice?: number;
  isTaker?: boolean;
  feeCost?: number;
  createdTime?: string;
};

const RENAME_FILL: Record<string, string> = {
  fill_id: 'fillId',
  order_id: 'orderId',
  ticker: 'ticker',
  outcome_side: 'outcomeSide',
  book_side: 'bookSide',
  count_fp: 'count',
  yes_price_dollars: 'yesPrice',
  no_price_dollars: 'noPrice',
  is_taker: 'isTaker',
  fee_cost: 'feeCost',
  created_time: 'createdTime',
};

const _fill = Guardian.object({
  fillId: Guardian.string().minLength(1),
  orderId: Guardian.string().optional(),
  ticker: Guardian.string().optional(),
  outcomeSide: Guardian.string().optional(),
  bookSide: Guardian.string().optional(),
  count: Guardian.number().optional(),
  yesPrice: Guardian.number().optional(),
  noPrice: Guardian.number().optional(),
  isTaker: Guardian.boolean().optional(),
  feeCost: Guardian.number().optional(),
  createdTime: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Kalshi fill',
  description: 'One execution against the account’s own orders.',
});

/**
 * Schema for one entry of `GET /portfolio/fills`.
 *
 * @example
 * ```typescript
 * import { FillSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, fill] = FillSchemaObject.safeParse({
 *   fill_id: 'f1', order_id: 'o1', count_fp: '1.00', is_taker: true,
 * });
 * ```
 */
export const FillSchemaObject: BaseGuardian<Fill> = Guardian.preprocess(
  normalizeWith(RENAME_FILL),
  _fill,
);

/** `GET /portfolio/fills` response. */
export type FillsPage = {
  fills: Fill[];
  cursor?: string;
};

const _fillsPage = Guardian.object({
  fills: Guardian.array(FillSchemaObject),
  cursor: Guardian.string().optional(),
}).describe({
  title: 'Kalshi fills page',
  description: 'A cursor-paginated page of the account’s executions.',
});

/**
 * Schema for the `GET /portfolio/fills` response.
 *
 * @example
 * ```typescript
 * import { FillsPageSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, page] = FillsPageSchemaObject.safeParse({ fills: [] });
 * ```
 */
export const FillsPageSchemaObject: BaseGuardian<FillsPage> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return { fills: obj.fills ?? [], cursor: obj.cursor };
    },
    _fillsPage,
  );
