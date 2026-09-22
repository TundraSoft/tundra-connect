import { type BaseGuardian, Guardian } from '@guardian';

/** Fields Gamma sometimes serializes as a JSON-encoded string and sometimes as a native array (observed in the wild, not documented). */
const ARRAY_FIELDS = ['outcomes', 'outcomePrices', 'clobTokenIds'] as const;

/** Fields Gamma may omit entirely; the vendor's own default for each is `false`. */
const BOOLEAN_DEFAULT_FALSE_FIELDS = [
  'active',
  'closed',
  'archived',
  'negRisk',
] as const;

/**
 * Normalizes a `outcomes`/`outcomePrices`/`clobTokenIds` value to a plain
 * `string[]`: `null`/`undefined`/`''` become `[]`; a JSON-encoded string
 * (e.g. `'["Yes","No"]'`) is parsed; a native array passes through
 * unchanged (or, if parsing fails, is left for {@link Guardian.array} to
 * reject with a clear error).
 */
function normalizeStringOrArray(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Pre-validation fixup for a raw Gamma market object — see
 * {@link ARRAY_FIELDS} and {@link BOOLEAN_DEFAULT_FALSE_FIELDS}. Applied via
 * `Guardian.preprocess` on the WHOLE object rather than per-field: a
 * per-field `Guardian.preprocess` composed as an `Guardian.object()` value
 * does not correctly run before that field's own type check (verified
 * empirically against `@tundralibs/guardian@1.1.0` — a field-level
 * preprocess guard sees the raw wire value skip its transform and hit the
 * inner schema's type check directly), so every field this connect needs
 * to reshape is fixed up here, upfront, on a plain object.
 */
function normalizeGammaMarket(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const key of ARRAY_FIELDS) {
    obj[key] = normalizeStringOrArray(obj[key]);
  }
  for (const key of BOOLEAN_DEFAULT_FALSE_FIELDS) {
    if (obj[key] === undefined || obj[key] === null) obj[key] = false;
  }
  return obj;
}

/** Per-market fee schedule — only present when the market has fees enabled. */
export type FeeSchedule = {
  /** Base fee rate. */
  rate: number;
  /**
   * Documented on the wire but not part of Polymarket's actual fee
   * formula (`rate × (1 − price)`) — kept for completeness, unused for
   * fee calculation.
   */
  exponent: number;
  /** Maker rebate share (0..1); absent means no rebate. Only paid when `takerOnly` is not `true`. */
  rebateRate?: number;
  /** When `true`, only takers pay fees (makers pay zero, may earn a rebate); absent means `false`. */
  takerOnly?: boolean;
};

/**
 * Schema for a market's fee schedule.
 *
 * Polymarket's documented fee formula (https://docs.polymarket.com/trading/fees):
 * `fee_dollars = size × rate × p × (1 − p)`, i.e. fee as a percentage of
 * trade value is `rate × (1 − p)` — symmetric, peaking at `p = 0.5`.
 *
 * @example
 * ```typescript
 * import { FeeScheduleSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, fees] = FeeScheduleSchemaObject.safeParse({ rate: 0.07, exponent: 1 });
 * ```
 */
export const FeeScheduleSchemaObject: BaseGuardian<FeeSchedule> = Guardian
  .object({
    rate: Guardian.number(),
    exponent: Guardian.number(),
    rebateRate: Guardian.number().optional(),
    takerOnly: Guardian.boolean().optional(),
  }).describe({
    title: 'Fee schedule',
    description: 'Per-market taker/maker fee configuration.',
  });

/**
 * A Gamma market entry. This models the subset of the ~90-field vendor
 * payload this connect actively validates — additional vendor fields pass
 * through unvalidated (`.passthrough()`) rather than being stripped, so
 * callers who need a field this schema doesn't model yet can still reach
 * it on the parsed object.
 */
export type GammaMarket = {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  description?: string;
  /** ISO-8601. Kept as-is so callers can format per their own locale. */
  startDate?: string;
  endDate?: string;
  /** Actual trading-window start — distinct from `startDate`, which can be the listing date for a recurring/rolling market. */
  eventStartTime?: string;
  outcomes: string[];
  outcomePrices: string[];
  clobTokenIds: string[];
  active: boolean;
  closed: boolean;
  archived: boolean;
  /**
   * UMA oracle finality. `closed` is only a trading flag —
   * `outcomePrices` hold book/last-trade values until the oracle settles
   * them to an exact `"1"`/`"0"`; this is the only signal in the payload
   * that the prices are truly final (`"resolved"`) rather than
   * `"proposed"`/`"disputed"`/absent.
   */
  umaResolutionStatus?: string | null;
  /** Best bid/ask aggregated across both outcomes (server-computed). For per-token bid/ask, use the CLOB. */
  bestBid?: number | null;
  bestAsk?: number | null;
  spread?: number | null;
  volume?: string | null;
  volumeNum?: number | null;
  volume24hr?: number | null;
  liquidityNum?: number | null;
  acceptingOrders?: boolean | null;
  enableOrderBook?: boolean | null;
  negRisk: boolean;
  /** Present only when the market has a non-default fee schedule. */
  feeSchedule?: FeeSchedule;
};

const _gammaMarket = Guardian.object({
  id: Guardian.string().minLength(1),
  question: Guardian.string(),
  conditionId: Guardian.string().minLength(1),
  slug: Guardian.string().minLength(1),
  description: Guardian.string().optional(),
  startDate: Guardian.string().optional(),
  endDate: Guardian.string().optional(),
  eventStartTime: Guardian.string().optional(),
  outcomes: Guardian.array(Guardian.string()),
  outcomePrices: Guardian.array(Guardian.string()),
  clobTokenIds: Guardian.array(Guardian.string()),
  active: Guardian.boolean(),
  closed: Guardian.boolean(),
  archived: Guardian.boolean(),
  umaResolutionStatus: Guardian.string().nullable().optional(),
  bestBid: Guardian.number().nullable().optional(),
  bestAsk: Guardian.number().nullable().optional(),
  spread: Guardian.number().nullable().optional(),
  volume: Guardian.string().nullable().optional(),
  volumeNum: Guardian.number().nullable().optional(),
  volume24hr: Guardian.number().nullable().optional(),
  liquidityNum: Guardian.number().nullable().optional(),
  acceptingOrders: Guardian.boolean().nullable().optional(),
  enableOrderBook: Guardian.boolean().nullable().optional(),
  negRisk: Guardian.boolean(),
  feeSchedule: FeeScheduleSchemaObject.optional(),
}).passthrough().describe({
  title: 'Gamma market',
  description:
    'A single Polymarket market as returned by the Gamma discovery API.',
});

/**
 * Schema for one market as returned by Gamma's `/markets`,
 * `/markets/keyset`, and `/markets/slug/{slug}` endpoints.
 *
 * @example
 * ```typescript
 * import { GammaMarketSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, market] = GammaMarketSchemaObject.safeParse({
 *   id: '253591',
 *   question: 'Will BTC be up in the next 5 minutes?',
 *   conditionId: '0x1234...',
 *   slug: 'btc-updown-5m-1732012800',
 *   outcomes: '["Up","Down"]',
 *   outcomePrices: '["0.52","0.48"]',
 *   clobTokenIds: '["111...","222..."]',
 *   active: true,
 *   closed: false,
 *   archived: false,
 * });
 * ```
 */
export const GammaMarketSchemaObject: BaseGuardian<GammaMarket> = Guardian
  .preprocess(normalizeGammaMarket, _gammaMarket);

/** Response schema for Gamma's `/markets`/`/markets/keyset` endpoints — an array of {@link GammaMarketSchemaObject} entries. */
export type GammaMarketList = GammaMarket[];

/**
 * Schema for a page of Gamma markets.
 *
 * @example
 * ```typescript
 * import { GammaMarketListSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, markets] = GammaMarketListSchemaObject.safeParse([]);
 * ```
 */
export const GammaMarketListSchemaObject: BaseGuardian<GammaMarketList> =
  Guardian.array(GammaMarketSchemaObject).describe({
    title: 'Gamma markets page',
    description: 'A page of Gamma market entries.',
  });

/**
 * Response shape for the `/markets/keyset` endpoint specifically — unlike
 * legacy `/markets` (a bare array, see {@link GammaMarketListSchemaObject}),
 * keyset wraps its page in an object carrying the pagination cursor.
 */
export type GammaMarketKeysetPage = {
  markets: GammaMarket[];
  /** Pass back as `after_cursor` to fetch the following page; absent/empty means this was the last page. */
  nextCursor?: string;
};

const _keysetPage = Guardian.object({
  markets: Guardian.array(GammaMarketSchemaObject),
  nextCursor: Guardian.string().optional(),
}).describe({
  title: 'Gamma markets keyset page',
  description: 'A cursor-paginated page of Gamma market entries.',
});

/**
 * Schema for the Gamma `/markets/keyset` response.
 *
 * @example
 * ```typescript
 * import { GammaMarketKeysetPageSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, page] = GammaMarketKeysetPageSchemaObject.safeParse({ markets: [] });
 * ```
 */
export const GammaMarketKeysetPageSchemaObject: BaseGuardian<
  GammaMarketKeysetPage
> = Guardian.preprocess(
  (raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const obj = raw as Record<string, unknown>;
    return {
      markets: obj.markets ?? [],
      nextCursor: obj.next_cursor ?? obj.nextCursor,
    };
  },
  _keysetPage,
);
