import { type BaseGuardian, Guardian } from '@guardian';
import { camelize, stringifyIds } from './normalize.ts';

/**
 * One trade — every individual print, from REST or the `trades.*`
 * channels. Keys camelCased, every field kept.
 *
 * `starbaseMatchId` and `starbaseTimestamp` (nanoseconds) are wider than a
 * double can hold, so they are always strings with their exact digits.
 */
export type DeribitTradeSchema = {
  /** Unique trade id. */
  tradeId: string;
  /** Sequence of the trade within its instrument — consecutive, so a jump is a missed trade. */
  tradeSeq: number;
  /** Trade time, Unix ms. */
  timestamp: number;
  instrumentName: string;
  price: number;
  /** Amount: USD for perpetuals/futures, base currency for options. */
  amount: number;
  /** Taker side: `buy` or `sell`. */
  direction: 'buy' | 'sell';
  indexPrice: number;
  markPrice: number;
  /** 0 plus tick, 1 zero-plus, 2 minus, 3 zero-minus. */
  tickDirection: number;
  /** Implied volatility of the trade (%), options only. */
  iv?: number;
  contracts?: number;
  /** `M` (maker), `T` (taker) or `MT` when it was a liquidation. */
  liquidation?: string;
  blockTradeId?: string;
  comboId?: string;
  /** Matching-engine id, exact digits. */
  starbaseMatchId?: string;
  /** Matching-engine time, Unix nanoseconds, exact digits. */
  starbaseTimestamp?: string;
} & Record<string, unknown>;

/**
 * Validates one trade (raw wire keys in, camelCased out). Feed it values
 * parsed with `parseJsonLossless` to keep the starbase fields exact.
 *
 * @example
 * ```ts
 * import { DeribitTradeSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [error, trade] = DeribitTradeSchemaObject.safeParse({
 *   trade_id: '462303753', trade_seq: 315282656, timestamp: 1794003632876,
 *   instrument_name: 'BTC-PERPETUAL', price: 75947.5, amount: 450,
 *   direction: 'sell', index_price: 75927.33, mark_price: 75947.52,
 *   tick_direction: 2, starbase_timestamp: '1794003632876548820',
 * });
 * if (!error) console.log(trade.tradeSeq, trade.starbaseTimestamp);
 * ```
 */
export const DeribitTradeSchemaObject: BaseGuardian<DeribitTradeSchema> =
  Guardian.preprocess(
    (raw: unknown) => {
      const value = camelize(raw);
      return typeof value === 'object' && value !== null
        ? stringifyIds(value as Record<string, unknown>, [
          'starbaseMatchId',
          'starbaseTimestamp',
        ])
        : value;
    },
    Guardian.object({
      tradeId: Guardian.string().minLength(1),
      tradeSeq: Guardian.number().strict().integer(),
      timestamp: Guardian.number().strict(),
      instrumentName: Guardian.string().minLength(1),
      price: Guardian.number().strict(),
      amount: Guardian.number().strict(),
      direction: Guardian.enum(['buy', 'sell'] as const),
      indexPrice: Guardian.number().strict(),
      markPrice: Guardian.number().strict(),
      tickDirection: Guardian.number().strict(),
      iv: Guardian.number().strict().optional(),
      contracts: Guardian.number().strict().optional(),
      liquidation: Guardian.string().optional(),
      blockTradeId: Guardian.string().optional(),
      comboId: Guardian.string().optional(),
      starbaseMatchId: Guardian.string().optional(),
      starbaseTimestamp: Guardian.string().optional(),
    }).passthrough().describe({
      title: 'Deribit trade',
      description: 'One individual trade, with its per-instrument sequence.',
    }),
  ) as BaseGuardian<DeribitTradeSchema>;

/** A page of trades from `public/get_last_trades_by_*`. */
export type DeribitTradesPageSchema = {
  trades: DeribitTradeSchema[];
  /** More trades exist past this page. */
  hasMore: boolean;
} & Record<string, unknown>;

/**
 * Validates a trades page.
 *
 * @example
 * ```ts
 * import { DeribitTradesPageSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [error, page] = DeribitTradesPageSchemaObject.safeParse({ trades: [], has_more: false });
 * if (!error) console.log(page.hasMore);
 * ```
 */
export const DeribitTradesPageSchemaObject: BaseGuardian<
  DeribitTradesPageSchema
> = Guardian.preprocess(
  (raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const { trades, has_more, ...rest } = raw as Record<string, unknown>;
    return { ...(camelize(rest) as object), trades, hasMore: has_more };
  },
  Guardian.object({
    trades: Guardian.array(DeribitTradeSchemaObject),
    hasMore: Guardian.boolean().strict(),
  }).passthrough(),
) as BaseGuardian<DeribitTradesPageSchema>;
