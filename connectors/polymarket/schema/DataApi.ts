import { type BaseGuardian, Guardian } from '@guardian';
import { camelizeKeys } from './camelizeKeys.ts';

/**
 * Data API v2 (`data-api.polymarket.com/v2`) schemas — the public,
 * read-only portfolio, activity, token and resolution views. v2 wraps every
 * payload in `data` (paginated reads add `pagination` with an opaque
 * cursor) and is snake_case on the wire; these schemas camelCase every key,
 * modelled or not, and `.passthrough()` keeps every unmodelled vendor field
 * on the parsed object. Money and sizes are JSON numbers: bare fields are
 * shares, `…Usdc` fields are USD.
 *
 * Profile and Gamma enrichment fields (`title`, `slug`, `icon`, `name`,
 * `pseudonym`, …) are optional here: the vendor fills them best-effort, and
 * a missing label must not fail a page of economics.
 */

const string = () => Guardian.string();
const optionalString = () => Guardian.string().optional();
const nullableString = () => Guardian.string().nullable().optional();

// ── Pagination ─────────────────────────────────────────────────────────────

/** The `pagination` block of every paginated v2 read. */
export type DataPagination = {
  /** Exact: `true` iff another page exists. */
  hasMore: boolean;
  /** Page size this page was served with. */
  limit: number;
  /** Pass back as `cursor` for the next page; `null` on the last page. */
  nextCursor: string | null;
  /** Running item offset, for display only — the cursor drives paging. */
  offset: number;
};

const _pagination = Guardian.object({
  hasMore: Guardian.boolean().strict(),
  limit: Guardian.number(),
  nextCursor: Guardian.string().nullable(),
  offset: Guardian.number(),
}).passthrough();

/**
 * Schema for a v2 `pagination` block (already camelCased).
 *
 * @example
 * ```typescript
 * import { DataPaginationSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, page] = DataPaginationSchemaObject.safeParse({
 *   hasMore: false, limit: 100, nextCursor: null, offset: 0,
 * });
 * ```
 */
export const DataPaginationSchemaObject: BaseGuardian<DataPagination> =
  _pagination.describe({
    title: 'Data API pagination',
    description: 'Cursor paging: follow `nextCursor` until it is `null`.',
  });

// ── Positions ──────────────────────────────────────────────────────────────

/** One position, as `GET /v2/positions` returns it. */
export type DataPosition = {
  /** The proxy/funder wallet that holds the position. */
  proxyWallet: string;
  /** Outcome token id. */
  tokenId: string;
  conditionId: string;
  /** `OPEN` | `REDEEMABLE` | `CLOSED` | … — the row's actual state, which can be narrower than the requested `status`. */
  status: string;
  /** The CURRENT holding, in shares. */
  currentSize: number;
  /** Weighted-average entry price per share, fee-exclusive. */
  avgPrice: number;
  /** Fee-exclusive entry basis, USDC. */
  entryCostUsdc: number;
  /** Attributed buy fees, USDC — already excluded from `entryCostUsdc`; never re-deduct. */
  entryFeesUsdc: number;
  /** Fee-inclusive basis: `entryCostUsdc + entryFeesUsdc`. */
  totalCostUsdc: number;
  /** Live mark per share (a settled outcome is valued at its 0/1 payout). */
  currentPrice: number;
  /** `currentSize × currentPrice`, USDC. */
  currentValue: number;
  /** LIFETIME bought shares — not the current balance (that is `currentSize`). */
  totalSize: number;
  realizedPnl: number;
  /** `currentValue − entryCostUsdc`. */
  unrealizedPnl: number;
  /** `realizedPnl + unrealizedPnl`. */
  totalPnl: number;
  percentPnl: number;
  percentRealizedPnl: number;
  /** Market resolved and tokens still held (losing sides included — redeemable ≠ won). */
  redeemable: boolean;
  /** The wallet also holds the opposite outcome, so the pair can merge back to collateral. */
  mergeable: boolean;
  negativeRisk: boolean;
  archived: boolean;
  outcome: string;
  /** `999` when the outcome could not be labelled. */
  outcomeIndex: number;
  oppositeOutcome?: string;
  oppositeTokenId?: string;
  /** Epoch seconds of the first acquisition; `0` when none is recorded. */
  firstEntryAt: number;
  /** Epoch seconds of the last economics event; `0` without native state. */
  lastEventAt: number;
  /** `YYYY-MM-DD`; `1970-01-01` when Gamma has none. */
  endDate?: string;
  eventId?: string;
  eventSlug?: string;
  title?: string;
  slug?: string;
  icon?: string;
  name?: string;
  profileImage?: string;
  verified?: boolean;
};

const _position = Guardian.object({
  proxyWallet: string(),
  tokenId: string(),
  conditionId: string(),
  status: string(),
  currentSize: Guardian.number(),
  avgPrice: Guardian.number(),
  entryCostUsdc: Guardian.number(),
  entryFeesUsdc: Guardian.number(),
  totalCostUsdc: Guardian.number(),
  currentPrice: Guardian.number(),
  currentValue: Guardian.number(),
  totalSize: Guardian.number(),
  realizedPnl: Guardian.number(),
  unrealizedPnl: Guardian.number(),
  totalPnl: Guardian.number(),
  percentPnl: Guardian.number(),
  percentRealizedPnl: Guardian.number(),
  redeemable: Guardian.boolean().strict(),
  mergeable: Guardian.boolean().strict(),
  negativeRisk: Guardian.boolean().strict(),
  archived: Guardian.boolean().strict(),
  outcome: string(),
  outcomeIndex: Guardian.number(),
  oppositeOutcome: optionalString(),
  oppositeTokenId: optionalString(),
  firstEntryAt: Guardian.number(),
  lastEventAt: Guardian.number(),
  endDate: optionalString(),
  eventId: optionalString(),
  eventSlug: optionalString(),
  title: optionalString(),
  slug: optionalString(),
  icon: optionalString(),
  name: optionalString(),
  profileImage: optionalString(),
  verified: Guardian.boolean().strict().optional(),
}).passthrough().describe({
  title: 'Data API position',
  description:
    'One position of a wallet, with fee-exclusive basis, mark-to-market and PnL in USDC.',
});

/**
 * Schema for one `GET /v2/positions` row (snake_case on the wire).
 *
 * @example
 * ```typescript
 * import { DataPositionSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, position] = DataPositionSchemaObject.safeParse({
 *   proxy_wallet: '0x8717…', token_id: '1097…', condition_id: '0xf9e2…', status: 'OPEN',
 *   current_size: 4.79, avg_price: 0.62, entry_cost_usdc: 2.97, entry_fees_usdc: 0.079,
 *   total_cost_usdc: 3.049, current_price: 0.5, current_value: 2.39, total_size: 4.79,
 *   realized_pnl: 0, unrealized_pnl: -0.58, total_pnl: -0.58, percent_pnl: -19.4,
 *   percent_realized_pnl: -19.4, redeemable: false, mergeable: false, negative_risk: false,
 *   archived: false, outcome: 'Up', outcome_index: 0, first_entry_at: 1790648328,
 *   last_event_at: 1790649086,
 * });
 * ```
 */
export const DataPositionSchemaObject: BaseGuardian<DataPosition> = Guardian
  .preprocess(camelizeKeys, _position);

/** The `GET /v2/positions` response. */
export type DataPositionsPage = {
  data: DataPosition[];
  pagination: DataPagination;
};

/**
 * Schema for the `GET /v2/positions` response.
 *
 * @example
 * ```typescript
 * import { DataPositionsPageSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, page] = DataPositionsPageSchemaObject.safeParse({
 *   data: [], pagination: { has_more: false, limit: 100, next_cursor: null, offset: 0 },
 * });
 * ```
 */
export const DataPositionsPageSchemaObject: BaseGuardian<DataPositionsPage> =
  Guardian.preprocess(
    camelizeKeys,
    Guardian.object({
      data: Guardian.array(_position),
      pagination: _pagination,
    }).passthrough().describe({
      title: 'Data API positions page',
      description: 'One cursor page of a wallet’s (or a market’s) positions.',
    }),
  );

// ── Portfolio value ────────────────────────────────────────────────────────

/** `GET /v2/value`'s `data`: one row for the requested wallet. */
export type DataValue = {
  proxyWallet: string;
  /** Holdings marked to market plus unresolved combos at cost, USDC (4 dp). */
  value: number;
};

/**
 * Schema for the `GET /v2/value` response, unwrapped to its `data` row.
 *
 * @example
 * ```typescript
 * import { DataValueSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, value] = DataValueSchemaObject.safeParse({
 *   data: { proxy_wallet: '0x8717…', value: 122392.07 },
 * });
 * ```
 */
export const DataValueSchemaObject: BaseGuardian<DataValue> = Guardian
  .preprocess(
    (raw: unknown) => camelizeKeys((raw as { data?: unknown } | null)?.data),
    Guardian.object({
      proxyWallet: string(),
      value: Guardian.number(),
    }).passthrough().describe({
      title: 'Data API portfolio value',
      description: 'Mark-to-market value of one wallet’s positions in USDC.',
    }),
  );

// ── Activity and trades ────────────────────────────────────────────────────

/** Fields every `/v2/activity` and `/v2/trades` row shares. */
type DataFeedRowCommon = {
  proxyWallet: string;
  conditionId: string;
  /** Outcome token id; `''` where the action touches no single token. */
  tokenId: string;
  /** Shares; never USD. */
  size: number;
  /** Price per share, USDC (`0` where none applies). */
  price: number;
  /** `BUY` | `SELL` from this wallet's side; `''` where none applies. */
  side: string;
  /** Block timestamp, epoch seconds. */
  timestamp: number;
  transactionHash: string;
  outcome: string;
  /** `999` when the outcome could not be labelled. */
  outcomeIndex: number;
  title?: string;
  slug?: string;
  eventSlug?: string;
  icon?: string;
  name?: string;
  pseudonym?: string;
  bio?: string;
  profileImage?: string;
  profileImageOptimized?: string;
};

/** One `GET /v2/activity` row — a trade, split, merge, redeem, reward, … */
export type DataActivity = DataFeedRowCommon & {
  /** `TRADE` | `SPLIT` | `MERGE` | `REDEEM` | `REWARD` | `CONVERSION` | `MAKER_REBATE` | … */
  type: string;
  /** Cash value of the action, USDC. */
  usdcSize: number;
  /** Set on combo trade rows only. */
  isCombo?: boolean;
};

/** One `GET /v2/trades` row — a single fill. */
export type DataTrade = DataFeedRowCommon;

const FEED_ROW_FIELDS = {
  proxyWallet: string(),
  conditionId: string(),
  tokenId: string(),
  size: Guardian.number(),
  price: Guardian.number(),
  side: string(),
  timestamp: Guardian.number(),
  transactionHash: string(),
  outcome: string(),
  outcomeIndex: Guardian.number(),
  title: optionalString(),
  slug: optionalString(),
  eventSlug: optionalString(),
  icon: optionalString(),
  name: optionalString(),
  pseudonym: optionalString(),
  bio: optionalString(),
  profileImage: optionalString(),
  profileImageOptimized: optionalString(),
};

const _activity = Guardian.object({
  ...FEED_ROW_FIELDS,
  type: string(),
  usdcSize: Guardian.number(),
  isCombo: Guardian.boolean().strict().optional(),
}).passthrough().describe({
  title: 'Data API activity row',
  description:
    'One on-chain action of a wallet: trade, split, merge, redeem, reward, …',
});

const _trade = Guardian.object(FEED_ROW_FIELDS).passthrough().describe({
  title: 'Data API trade',
  description: 'One fill from the public trade feed.',
});

/**
 * Schema for one `GET /v2/activity` row.
 *
 * @example
 * ```typescript
 * import { DataActivitySchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, row] = DataActivitySchemaObject.safeParse({
 *   proxy_wallet: '0x8717…', condition_id: '0x9cba…', token_id: '6480…', type: 'TRADE',
 *   size: 3.96, usdc_size: 3.02, price: 0.75, side: 'BUY', timestamp: 1792182974,
 *   transaction_hash: '0x3e31…', outcome: 'Up', outcome_index: 0,
 * });
 * ```
 */
export const DataActivitySchemaObject: BaseGuardian<DataActivity> = Guardian
  .preprocess(camelizeKeys, _activity);

/** The `GET /v2/activity` response. */
export type DataActivityPage = {
  data: DataActivity[];
  pagination: DataPagination;
};

/**
 * Schema for the `GET /v2/activity` response.
 *
 * @example
 * ```typescript
 * import { DataActivityPageSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, page] = DataActivityPageSchemaObject.safeParse({
 *   data: [], pagination: { has_more: false, limit: 100, next_cursor: null, offset: 0 },
 * });
 * ```
 */
export const DataActivityPageSchemaObject: BaseGuardian<DataActivityPage> =
  Guardian.preprocess(
    camelizeKeys,
    Guardian.object({
      data: Guardian.array(_activity),
      pagination: _pagination,
    }).passthrough().describe({
      title: 'Data API activity page',
      description: 'One cursor page of a wallet’s activity feed.',
    }),
  );

/**
 * Schema for one `GET /v2/trades` row.
 *
 * @example
 * ```typescript
 * import { DataTradeSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, trade] = DataTradeSchemaObject.safeParse({
 *   proxy_wallet: '0x8717…', condition_id: '0x9cba…', token_id: '6480…', size: 3.96,
 *   price: 0.75, side: 'BUY', timestamp: 1792182974, transaction_hash: '0x3e31…',
 *   outcome: 'Up', outcome_index: 0,
 * });
 * ```
 */
export const DataTradeSchemaObject: BaseGuardian<DataTrade> = Guardian
  .preprocess(camelizeKeys, _trade);

/** The `GET /v2/trades` response. */
export type DataTradesPage = {
  data: DataTrade[];
  pagination: DataPagination;
};

/**
 * Schema for the `GET /v2/trades` response.
 *
 * @example
 * ```typescript
 * import { DataTradesPageSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, page] = DataTradesPageSchemaObject.safeParse({
 *   data: [], pagination: { has_more: false, limit: 100, next_cursor: null, offset: 0 },
 * });
 * ```
 */
export const DataTradesPageSchemaObject: BaseGuardian<DataTradesPage> = Guardian
  .preprocess(
    camelizeKeys,
    Guardian.object({
      data: Guardian.array(_trade),
      pagination: _pagination,
    }).passthrough().describe({
      title: 'Data API trades page',
      description: 'One cursor page of the trade feed.',
    }),
  );

// ── Tokens ─────────────────────────────────────────────────────────────────

/** One `GET /v2/tokens` row: the reference facts for one ERC-1155 token id. */
export type DataToken = {
  /** Decimal token id. */
  tokenId: string;
  /** The market's condition id, 66-character form. */
  conditionId: string;
  /** The polymarket-v2 condition id, 66-character form; `null` on `v1_ctf` tokens. */
  structuralConditionId?: string | null;
  /** Contract family: `v1_ctf` (ConditionalTokens) or a polymarket-v2 module. */
  module: string;
  /** On-chain outcome slot within the condition. */
  outcomeIndex: number;
  /** Position in the market's CLOB token list; `null` outside `v1_ctf` or until placed. */
  clobIndex?: number | null;
  outcome?: string | null;
  oppositeTokenId?: string | null;
  /** `true` once the token has an on-chain payout. */
  resolved: boolean;
  /** Payout per share once resolved (0 lost, 1 won, fractions for split payouts); `null` while unresolved. */
  finalPrice?: number | null;
  title?: string | null;
  marketSlug?: string | null;
  closed?: boolean | null;
  negRisk?: boolean | null;
  negRiskMarketId?: string | null;
  /** Index of the market inside its neg-risk structure. */
  questionIndex?: number | null;
  eventId?: number | null;
  eventSlug?: string | null;
};

const _token = Guardian.object({
  tokenId: string(),
  conditionId: string(),
  structuralConditionId: nullableString(),
  module: string(),
  outcomeIndex: Guardian.number(),
  clobIndex: Guardian.number().nullable().optional(),
  outcome: nullableString(),
  oppositeTokenId: nullableString(),
  resolved: Guardian.boolean().strict(),
  finalPrice: Guardian.number().nullable().optional(),
  title: nullableString(),
  marketSlug: nullableString(),
  closed: Guardian.boolean().strict().nullable().optional(),
  negRisk: Guardian.boolean().strict().nullable().optional(),
  negRiskMarketId: nullableString(),
  questionIndex: Guardian.number().nullable().optional(),
  eventId: Guardian.number().nullable().optional(),
  eventSlug: nullableString(),
}).passthrough().describe({
  title: 'Data API token',
  description:
    'Reference facts for one outcome token: condition, module, outcome slot and settlement.',
});

/** The `GET /v2/tokens` response, unwrapped from `data`. */
export type DataTokenList = DataToken[];

/**
 * Schema for the `GET /v2/tokens` response, unwrapped to its `data` rows.
 *
 * @example
 * ```typescript
 * import { DataTokenListSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, tokens] = DataTokenListSchemaObject.safeParse({
 *   data: [{ token_id: '6480…', condition_id: '0x9cba…', module: 'v1_ctf', outcome_index: 0, resolved: true, final_price: 0 }],
 * });
 * ```
 */
export const DataTokenListSchemaObject: BaseGuardian<DataTokenList> = Guardian
  .preprocess(
    (raw: unknown) =>
      camelizeKeys((raw as { data?: unknown } | null)?.data ?? []),
    Guardian.array(_token),
  );

// ── Resolutions ────────────────────────────────────────────────────────────

/**
 * One `GET /v2/resolutions` row. Question-keyed (UMA) rows carry the
 * numeric-string price fields; condition-keyed rows carry payouts and
 * finality. `expectedSettlementTime` is an estimate, never a deadline.
 */
export type DataResolution = {
  /** `initialized` | `posed` | `proposed` | `challenged` | `reproposed` | `disputed` | `resolved` (condition rows also `active`, `arbitration`). */
  status: string;
  conditionId?: string | null;
  questionId?: string | null;
  /** True while a managed proposal sits past its expiry in extended review — no settlement estimate then. */
  extendedReview: boolean;
  wasDisputed: boolean;
  wasArbitrated?: boolean | null;
  newVersionQ: boolean;
  /** Latest lifecycle transaction; `''` when none. */
  transactionHash: string;
  /** Numeric string; `''` when `transactionHash` is empty. */
  logIndex: string;
  /** Epoch-seconds string on question rows, RFC3339 UTC on condition rows. */
  lastUpdateTimestamp: string;
  /** Estimated settlement time, RFC3339 UTC. Absent when no estimate applies. */
  expectedSettlementTime?: string | null;
  /** `managed_proposal_expiration` | `proposal_expiration` | `liveness` | `dvm_round_estimate`. */
  settlementTimeBasis?: string | null;
  /** Numeric strings; `"69"` means unset. Question rows only. */
  proposedPrice?: string | null;
  reproposedPrice?: string | null;
  price?: string | null;
  /** Per-outcome payout in micro-USDC per share, on resolved condition rows. */
  payouts?: number[] | null;
  /** `BINARY` | `INCREMENTAL_NEGRISK` | `ATOMIC_NEGRISK`. */
  marketType?: string | null;
  /** `UMA_OO` | `CHAINLINK` | `EOA`. */
  reporter?: string | null;
  /** `reported` | `derived`. */
  resolutionSource?: string | null;
  resolvedAt?: string | null;
  resolvedBlock?: number | null;
};

const _resolution = Guardian.object({
  status: string(),
  conditionId: nullableString(),
  questionId: nullableString(),
  extendedReview: Guardian.boolean().strict(),
  wasDisputed: Guardian.boolean().strict(),
  wasArbitrated: Guardian.boolean().strict().nullable().optional(),
  newVersionQ: Guardian.boolean().strict(),
  transactionHash: string(),
  logIndex: string(),
  lastUpdateTimestamp: string(),
  expectedSettlementTime: nullableString(),
  settlementTimeBasis: nullableString(),
  proposedPrice: nullableString(),
  reproposedPrice: nullableString(),
  price: nullableString(),
  payouts: Guardian.array(Guardian.number()).nullable().optional(),
  marketType: nullableString(),
  reporter: nullableString(),
  resolutionSource: nullableString(),
  resolvedAt: nullableString(),
  resolvedBlock: Guardian.number().nullable().optional(),
}).passthrough().describe({
  title: 'Data API resolution',
  description:
    'Resolution lifecycle of one condition or UMA question, with settlement-time estimates.',
});

/** The `GET /v2/resolutions` response, unwrapped from `data`. */
export type DataResolutionList = DataResolution[];

/**
 * Schema for the `GET /v2/resolutions` response, unwrapped to its `data` rows.
 *
 * @example
 * ```typescript
 * import { DataResolutionListSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, rows] = DataResolutionListSchemaObject.safeParse({
 *   data: [{
 *     condition_id: '0x9cba…', status: 'resolved', extended_review: false, was_disputed: false,
 *     new_version_q: false, transaction_hash: '0x7bd2…', log_index: '566',
 *     last_update_timestamp: '2026-10-16T20:40:54Z', payouts: [0, 1000000],
 *   }],
 * });
 * ```
 */
export const DataResolutionListSchemaObject: BaseGuardian<DataResolutionList> =
  Guardian.preprocess(
    (raw: unknown) =>
      camelizeKeys((raw as { data?: unknown } | null)?.data ?? []),
    Guardian.array(_resolution),
  );
