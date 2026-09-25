import { type BaseGuardian, Guardian } from '@guardian';

/** One public execution (not necessarily yours — this is market-wide trade tape). */
export type Trade = {
  tradeId: string;
  ticker: string;
  count: number;
  yesPrice: number;
  noPrice: number;
  takerOutcomeSide?: string;
  takerBookSide?: string;
  createdTime?: string;
  isBlockTrade?: boolean;
};

const RENAME_MAP: Record<string, string> = {
  trade_id: 'tradeId',
  ticker: 'ticker',
  count_fp: 'count',
  yes_price_dollars: 'yesPrice',
  no_price_dollars: 'noPrice',
  taker_outcome_side: 'takerOutcomeSide',
  taker_book_side: 'takerBookSide',
  created_time: 'createdTime',
  is_block_trade: 'isBlockTrade',
};

/**
 * Renames every snake_case wire field to its camelCase {@link Trade}
 * name. Numeric fixed-point strings are left as-is — `Guardian.number()`
 * coerces them below, and (unlike a hand-rolled `Number(x)`) correctly
 * rejects `''`/`null` instead of silently producing `0`.
 */
function normalizeTrade(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const out: Record<string, unknown> = {};
  for (
    const [wireKey, value] of Object.entries(raw as Record<string, unknown>)
  ) {
    out[RENAME_MAP[wireKey] ?? wireKey] = value;
  }
  return out;
}

const _trade = Guardian.object({
  tradeId: Guardian.string().minLength(1),
  ticker: Guardian.string().minLength(1),
  count: Guardian.number(),
  yesPrice: Guardian.number(),
  noPrice: Guardian.number(),
  takerOutcomeSide: Guardian.string().optional(),
  takerBookSide: Guardian.string().optional(),
  createdTime: Guardian.string().optional(),
  isBlockTrade: Guardian.boolean().optional(),
}).passthrough().describe({
  title: 'Kalshi trade',
  description: 'One public execution from the market-wide trade tape.',
});

/**
 * Schema for one entry of `GET /markets/trades`.
 *
 * @example
 * ```typescript
 * import { TradeSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, trade] = TradeSchemaObject.safeParse({
 *   trade_id: 't1', ticker: 'T', count_fp: '5.00',
 *   yes_price_dollars: '0.42', no_price_dollars: '0.58',
 * });
 * ```
 */
export const TradeSchemaObject: BaseGuardian<Trade> = Guardian.preprocess(
  normalizeTrade,
  _trade,
);

/** One page of `GET /markets/trades`. */
export type TradesPage = {
  trades: Trade[];
  cursor?: string;
};

const _tradesPage = Guardian.object({
  trades: Guardian.array(TradeSchemaObject),
  cursor: Guardian.string().optional(),
}).describe({
  title: 'Kalshi trades page',
  description: 'A cursor-paginated page of public trades.',
});

/**
 * Schema for the `GET /markets/trades` response.
 *
 * @example
 * ```typescript
 * import { TradesPageSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, page] = TradesPageSchemaObject.safeParse({ trades: [] });
 * ```
 */
export const TradesPageSchemaObject: BaseGuardian<TradesPage> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return { trades: obj.trades ?? [], cursor: obj.cursor };
    },
    _tradesPage,
  );
