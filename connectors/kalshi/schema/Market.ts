import { type BaseGuardian, Guardian } from '@guardian';

/**
 * A Kalshi market. Models the fields this connect actively validates from
 * the ~35-field vendor payload (docs.kalshi.com, `GET /markets`/
 * `GET /markets/{ticker}`) — additional vendor fields (multivariate-event
 * legs, structured/functional strike details, price-range ladders, ...)
 * pass through unvalidated (`.passthrough()`) rather than being stripped,
 * matching this repo's convention for a wide, evolving vendor payload (see
 * `../../polymarket/schema/GammaMarket.ts`).
 *
 * Prices/counts arrive on the wire as fixed-point DOLLAR/COUNT STRINGS
 * (`"0.4200"`, `"918.60"`) and are coerced to `number` here for read
 * convenience — this schema is for DISPLAY data only. Order submission
 * builds its own exact fixed-point strings from integer cents (see
 * `../Kalshi.ts`'s `dollarsFromCents`/`countFp`) rather than routing
 * through float math, the same separation Polymarket keeps between its
 * (numeric) `GammaMarket` display schema and its (exact-string) order
 * wire encoding.
 */
export type Market = {
  ticker: string;
  eventTicker: string;
  /**
   * Not present on the wire — Kalshi's ticker convention is
   * `{seriesTicker}-{rest}`; derived from `ticker` up to the first `-`.
   */
  seriesTicker?: string;
  marketType?: string;
  yesSubTitle?: string;
  noSubTitle?: string;
  createdTime?: string;
  updatedTime?: string;
  openTime?: string;
  closeTime?: string;
  expectedExpirationTime?: string | null;
  latestExpirationTime?: string;
  /**
   * Raw venue lifecycle status, e.g. `initialized`/`inactive`/`active`/
   * `closed`/`determined`/`disputed`/`amended`/`finalized`. NOTE: this is
   * a DIFFERENT vocabulary than {@link GetMarketsQuery.status}'s filter
   * values (`unopened`/`open`/`paused`/`closed`/`settled`) — Kalshi's
   * query-filter and response-status enums do not match 1:1.
   */
  status: string;
  /** `yes`/`no`/`scalar`/`''` (unsettled). */
  result?: string;
  yesBid?: number;
  yesAsk?: number;
  yesBidSize?: number;
  yesAskSize?: number;
  noBid?: number;
  noAsk?: number;
  lastPrice?: number;
  previousYesBid?: number;
  previousYesAsk?: number;
  previousPrice?: number;
  /** Traded volume (contracts). */
  volume?: number;
  volume24h?: number;
  /** Open interest (contracts). */
  openInterest?: number;
  notionalValue?: number;
  canCloseEarly?: boolean;
  /** Only present once the market has settled. */
  settlementValue?: number | null;
  settlementTs?: string | null;
  rulesPrimary?: string;
  rulesSecondary?: string;
};

/** Whether a raw Kalshi market `status` denotes a terminal settled market. */
export function isSettledStatus(status: string): boolean {
  return status === 'settled' || status === 'finalized';
}

/**
 * Series ticker, derived from `event_ticker`'s (or `ticker`'s) prefix up
 * to the first `-` — Kalshi's own convention, since the API does not
 * return a `series_ticker` field on the `Market` object itself.
 */
function deriveSeriesTicker(obj: Record<string, unknown>): string | undefined {
  const source = typeof obj.event_ticker === 'string' && obj.event_ticker
    ? obj.event_ticker
    : (typeof obj.ticker === 'string' ? obj.ticker : undefined);
  if (!source) return undefined;
  const dash = source.indexOf('-');
  return dash === -1 ? undefined : source.slice(0, dash);
}

/** snake_case wire field -> camelCase {@link Market} field, for every field this schema models. */
const RENAME_MAP: Record<string, string> = {
  ticker: 'ticker',
  event_ticker: 'eventTicker',
  market_type: 'marketType',
  yes_sub_title: 'yesSubTitle',
  no_sub_title: 'noSubTitle',
  created_time: 'createdTime',
  updated_time: 'updatedTime',
  open_time: 'openTime',
  close_time: 'closeTime',
  expected_expiration_time: 'expectedExpirationTime',
  latest_expiration_time: 'latestExpirationTime',
  status: 'status',
  result: 'result',
  yes_bid_dollars: 'yesBid',
  yes_ask_dollars: 'yesAsk',
  yes_bid_size_fp: 'yesBidSize',
  yes_ask_size_fp: 'yesAskSize',
  no_bid_dollars: 'noBid',
  no_ask_dollars: 'noAsk',
  last_price_dollars: 'lastPrice',
  previous_yes_bid_dollars: 'previousYesBid',
  previous_yes_ask_dollars: 'previousYesAsk',
  previous_price_dollars: 'previousPrice',
  volume_fp: 'volume',
  volume_24h_fp: 'volume24h',
  open_interest_fp: 'openInterest',
  notional_value_dollars: 'notionalValue',
  can_close_early: 'canCloseEarly',
  settlement_value_dollars: 'settlementValue',
  settlement_ts: 'settlementTs',
  rules_primary: 'rulesPrimary',
  rules_secondary: 'rulesSecondary',
};

/**
 * Pre-validation fixup for a raw Kalshi market object: renames every
 * snake_case wire field this schema models to its camelCase
 * {@link Market} name, and derives `seriesTicker`. Fixed-point dollar/
 * count strings are left as-is for `Guardian.number()`'s own coercion to
 * handle below — it already coerces a numeric string correctly and
 * (unlike a hand-rolled `Number(x)`) rejects `''`/`null` with a clear
 * validation error instead of silently producing `0`. Unmodeled fields
 * keep their original (snake_case) wire name and survive via
 * `.passthrough()`. Applied via `Guardian.preprocess` on the WHOLE object
 * rather than per-field — see `GammaMarket.ts`'s `normalizeGammaMarket`
 * for why a per-field preprocess inside `Guardian.object()` doesn't work.
 */
function normalizeMarket(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [wireKey, value] of Object.entries(obj)) {
    const camelKey = RENAME_MAP[wireKey];
    out[camelKey ?? wireKey] = value;
  }
  out.seriesTicker = deriveSeriesTicker(obj);
  return out;
}

const _market = Guardian.object({
  ticker: Guardian.string().minLength(1),
  eventTicker: Guardian.string().minLength(1),
  seriesTicker: Guardian.string().optional(),
  marketType: Guardian.string().optional(),
  yesSubTitle: Guardian.string().optional(),
  noSubTitle: Guardian.string().optional(),
  createdTime: Guardian.string().optional(),
  updatedTime: Guardian.string().optional(),
  openTime: Guardian.string().optional(),
  closeTime: Guardian.string().optional(),
  expectedExpirationTime: Guardian.string().nullable().optional(),
  latestExpirationTime: Guardian.string().optional(),
  status: Guardian.string(),
  result: Guardian.string().optional(),
  yesBid: Guardian.number().optional(),
  yesAsk: Guardian.number().optional(),
  yesBidSize: Guardian.number().optional(),
  yesAskSize: Guardian.number().optional(),
  noBid: Guardian.number().optional(),
  noAsk: Guardian.number().optional(),
  lastPrice: Guardian.number().optional(),
  previousYesBid: Guardian.number().optional(),
  previousYesAsk: Guardian.number().optional(),
  previousPrice: Guardian.number().optional(),
  volume: Guardian.number().optional(),
  volume24h: Guardian.number().optional(),
  openInterest: Guardian.number().optional(),
  notionalValue: Guardian.number().optional(),
  canCloseEarly: Guardian.boolean().optional(),
  settlementValue: Guardian.number().nullable().optional(),
  settlementTs: Guardian.string().nullable().optional(),
  rulesPrimary: Guardian.string().optional(),
  rulesSecondary: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Kalshi market',
  description:
    'A single Kalshi market as returned by the public market-data API.',
});

/**
 * Schema for one market. Wire fields are snake_case
 * (`event_ticker`/`yes_bid_dollars`/...) and normalized to the camelCase
 * shape above; `series_ticker` isn't on the wire at all and is derived.
 *
 * @example
 * ```typescript
 * import { MarketSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, market] = MarketSchemaObject.safeParse({
 *   ticker: 'KXBTCD-26JUL1515-T71799.99',
 *   event_ticker: 'KXBTCD-26JUL1515',
 *   status: 'active',
 *   yes_bid_dollars: '0.0100',
 * });
 * ```
 */
export const MarketSchemaObject: BaseGuardian<Market> = Guardian.preprocess(
  normalizeMarket,
  _market,
);

/** One page of `GET /markets`. */
export type MarketsPage = {
  markets: Market[];
  /** Empty/absent means no next page. */
  cursor?: string;
};

const _marketsPage = Guardian.object({
  markets: Guardian.array(MarketSchemaObject),
  cursor: Guardian.string().optional(),
}).describe({
  title: 'Kalshi markets page',
  description: 'A cursor-paginated page of Kalshi market entries.',
});

/**
 * Schema for the `GET /markets` response.
 *
 * @example
 * ```typescript
 * import { MarketsPageSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, page] = MarketsPageSchemaObject.safeParse({ markets: [] });
 * ```
 */
export const MarketsPageSchemaObject: BaseGuardian<MarketsPage> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return { markets: obj.markets ?? [], cursor: obj.cursor };
    },
    _marketsPage,
  );

/** Schema for the `GET /markets/{ticker}` response, which wraps the market as `{ "market": ... }`. */
export const SingleMarketSchemaObject: BaseGuardian<Market> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return obj.market ?? obj;
    },
    MarketSchemaObject,
  );

/** Filters for `GET /markets`. Every field is optional. */
export type GetMarketsQuery = {
  seriesTicker?: string;
  eventTicker?: string;
  /**
   * Query-filter vocabulary — NOT the same set as {@link Market.status}'s
   * response values (see that field's doc comment).
   */
  status?: 'unopened' | 'open' | 'paused' | 'closed' | 'settled';
  /** Comma-separated market tickers, or pass an array — this connect joins it for you. */
  tickers?: string | string[];
  cursor?: string;
  /** 0-1000; vendor default 100. */
  limit?: number;
  /** Unix seconds. */
  minCloseTs?: number;
  maxCloseTs?: number;
};
