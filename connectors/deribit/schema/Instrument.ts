import { type BaseGuardian, Guardian } from '@guardian';
import { camelize } from './normalize.ts';

/**
 * One instrument from `public/get_instruments` — keys camelCased, every
 * field kept. Options carry `strike` and `optionType`; futures and
 * perpetuals don't.
 */
export type DeribitInstrumentSchema = {
  /** e.g. `BTC-7NOV26-76000-C`, `BTC-PERPETUAL`. */
  instrumentName: string;
  /** `future`, `option`, `spot`, `future_combo`, `option_combo`. */
  kind: string;
  baseCurrency: string;
  quoteCurrency: string;
  settlementCurrency?: string;
  counterCurrency?: string;
  /** Expiry, Unix ms (far future for perpetuals). */
  expirationTimestamp: number;
  creationTimestamp: number;
  isActive: boolean;
  tickSize: number;
  contractSize: number;
  minTradeAmount: number;
  /** Option strike, in `counterCurrency`. */
  strike?: number;
  /** `call` or `put`. */
  optionType?: string;
  /** `day`, `week`, `month`, `perpetual`, ... */
  settlementPeriod?: string;
  instrumentId?: number;
  /** Price index the instrument references, e.g. `btc_usd`. */
  priceIndex?: string;
} & Record<string, unknown>;

/**
 * Validates one instrument (raw wire keys in, camelCased out).
 *
 * @example
 * ```ts
 * import { DeribitInstrumentSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [error, inst] = DeribitInstrumentSchemaObject.safeParse({
 *   instrument_name: 'BTC-7NOV26-76000-C', kind: 'option', base_currency: 'BTC',
 *   quote_currency: 'BTC', expiration_timestamp: 1794038400000,
 *   creation_timestamp: 1793692810000, is_active: true, tick_size: 0.0001,
 *   contract_size: 1, min_trade_amount: 0.1, strike: 76000, option_type: 'call',
 * });
 * if (!error) console.log(inst.strike);
 * ```
 */
export const DeribitInstrumentSchemaObject: BaseGuardian<
  DeribitInstrumentSchema
> = Guardian.preprocess(
  camelize,
  Guardian.object({
    instrumentName: Guardian.string().minLength(1),
    kind: Guardian.string(),
    baseCurrency: Guardian.string(),
    quoteCurrency: Guardian.string(),
    settlementCurrency: Guardian.string().optional(),
    counterCurrency: Guardian.string().optional(),
    expirationTimestamp: Guardian.number().strict(),
    creationTimestamp: Guardian.number().strict(),
    isActive: Guardian.boolean().strict(),
    tickSize: Guardian.number().strict(),
    contractSize: Guardian.number().strict(),
    minTradeAmount: Guardian.number().strict(),
    strike: Guardian.number().strict().optional(),
    optionType: Guardian.string().optional(),
    settlementPeriod: Guardian.string().optional(),
    instrumentId: Guardian.number().strict().optional(),
    priceIndex: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Deribit instrument',
    description: 'One tradable instrument, as public/get_instruments lists it.',
  }),
) as BaseGuardian<DeribitInstrumentSchema>;

/** One instrument's book summary from `public/get_book_summary_by_*`. */
export type DeribitBookSummarySchema = {
  instrumentName: string;
  baseCurrency?: string;
  quoteCurrency?: string;
  /** When the summary was made, Unix ms. */
  creationTimestamp: number;
  bidPrice: number | null;
  askPrice: number | null;
  midPrice?: number | null;
  markPrice: number;
  /** Mark implied volatility (%), options only. */
  markIv?: number;
  /** Price of the option's underlying. */
  underlyingPrice?: number;
  underlyingIndex?: string;
  interestRate?: number;
  openInterest: number;
  volume: number;
  volumeUsd?: number;
  high?: number | null;
  low?: number | null;
  last?: number | null;
  priceChange?: number | null;
  estimatedDeliveryPrice?: number;
} & Record<string, unknown>;

const price = () => Guardian.number().strict().nullable();

/**
 * Validates one book summary.
 *
 * @example
 * ```ts
 * import { DeribitBookSummarySchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * declare const row: unknown;
 * const [error, s] = DeribitBookSummarySchemaObject.safeParse(row);
 * if (!error) console.log(s.instrumentName, s.markIv);
 * ```
 */
export const DeribitBookSummarySchemaObject: BaseGuardian<
  DeribitBookSummarySchema
> = Guardian.preprocess(
  camelize,
  Guardian.object({
    instrumentName: Guardian.string().minLength(1),
    baseCurrency: Guardian.string().optional(),
    quoteCurrency: Guardian.string().optional(),
    creationTimestamp: Guardian.number().strict(),
    bidPrice: price(),
    askPrice: price(),
    midPrice: price().optional(),
    markPrice: Guardian.number().strict(),
    markIv: Guardian.number().strict().optional(),
    underlyingPrice: Guardian.number().strict().optional(),
    underlyingIndex: Guardian.string().optional(),
    interestRate: Guardian.number().strict().optional(),
    openInterest: Guardian.number().strict(),
    volume: Guardian.number().strict(),
    volumeUsd: Guardian.number().strict().optional(),
    high: price().optional(),
    low: price().optional(),
    last: price().optional(),
    priceChange: price().optional(),
    estimatedDeliveryPrice: Guardian.number().strict().optional(),
  }).passthrough().describe({
    title: 'Deribit book summary',
    description:
      'Top of book, mark price/IV, volume and open interest for one instrument.',
  }),
) as BaseGuardian<DeribitBookSummarySchema>;
