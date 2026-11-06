import { type BaseGuardian, Guardian } from '@guardian';
import { camelize } from './normalize.ts';

/** Option greeks as Deribit computes them. */
export type DeribitGreeksSchema = {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
} & Record<string, unknown>;

/** 24-hour statistics. */
export type DeribitTickerStatsSchema = {
  high?: number | null;
  low?: number | null;
  /** 24h change, %. */
  priceChange?: number | null;
  volume?: number;
  volumeUsd?: number;
} & Record<string, unknown>;

/**
 * A ticker from `public/ticker` or the `ticker.*` channels — keys
 * camelCased, every field kept. Options add `markIv`, `bidIv`, `askIv`,
 * `greeks` and the underlying; perpetuals add funding.
 */
export type DeribitTickerSchema = {
  instrumentName: string;
  /** Unix ms. */
  timestamp: number;
  /** `open`, `closed`, ... */
  state: string;
  markPrice: number;
  indexPrice: number;
  lastPrice?: number | null;
  bestBidPrice: number | null;
  bestBidAmount: number;
  bestAskPrice: number | null;
  bestAskAmount: number;
  openInterest?: number;
  settlementPrice?: number;
  estimatedDeliveryPrice?: number;
  minPrice?: number;
  maxPrice?: number;
  /** Mark implied volatility (%), options only. */
  markIv?: number;
  /** Implied volatility at the best bid (%). */
  bidIv?: number;
  /** Implied volatility at the best ask (%). */
  askIv?: number;
  /** Underlying price used for the IV/greeks. */
  underlyingPrice?: number;
  /** Underlying the option is priced off, e.g. `BTC-7NOV26` or `index_price`. */
  underlyingIndex?: string;
  interestRate?: number;
  greeks?: DeribitGreeksSchema;
  stats?: DeribitTickerStatsSchema;
  /** Perpetuals: current funding rate. */
  currentFunding?: number;
  /** Perpetuals: 8-hour funding. */
  funding8h?: number;
  interestValue?: number;
} & Record<string, unknown>;

const n = () => Guardian.number().strict();

/**
 * Validates a ticker (raw wire keys in, camelCased out).
 *
 * @example
 * ```ts
 * import { DeribitTickerSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * declare const raw: unknown;
 * const [error, t] = DeribitTickerSchemaObject.safeParse(raw);
 * if (!error) console.log(t.markIv, t.greeks?.delta);
 * ```
 */
export const DeribitTickerSchemaObject: BaseGuardian<DeribitTickerSchema> =
  Guardian.preprocess(
    camelize,
    Guardian.object({
      instrumentName: Guardian.string().minLength(1),
      timestamp: n(),
      state: Guardian.string(),
      markPrice: n(),
      indexPrice: n(),
      lastPrice: n().nullable().optional(),
      bestBidPrice: n().nullable(),
      bestBidAmount: n(),
      bestAskPrice: n().nullable(),
      bestAskAmount: n(),
      openInterest: n().optional(),
      settlementPrice: n().optional(),
      estimatedDeliveryPrice: n().optional(),
      minPrice: n().optional(),
      maxPrice: n().optional(),
      markIv: n().optional(),
      bidIv: n().optional(),
      askIv: n().optional(),
      underlyingPrice: n().optional(),
      underlyingIndex: Guardian.string().optional(),
      interestRate: n().optional(),
      greeks: Guardian.object({
        delta: n(),
        gamma: n(),
        vega: n(),
        theta: n(),
        rho: n(),
      }).passthrough().optional(),
      stats: Guardian.object({
        high: n().nullable().optional(),
        low: n().nullable().optional(),
        priceChange: n().nullable().optional(),
        volume: n().optional(),
        volumeUsd: n().optional(),
      }).passthrough().optional(),
      currentFunding: n().optional(),
      funding8h: n().optional(),
      interestValue: n().optional(),
    }).passthrough().describe({
      title: 'Deribit ticker',
      description:
        'Best bid/ask, mark price and, for options, mark IV and greeks.',
    }),
  ) as BaseGuardian<DeribitTickerSchema>;
