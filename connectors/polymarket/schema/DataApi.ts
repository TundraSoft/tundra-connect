import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Data API (`data-api.polymarket.com`) schemas — the public, read-only
 * portfolio view keyed by wallet address. Unlike the CLOB, this API is
 * already camelCase and already numeric on the wire, so these schemas
 * validate rather than normalize. `.passthrough()` keeps every unmodeled
 * vendor field (`icon`, `eventId`, `endDate`, ...) on the parsed object.
 */

/** One open position, as `GET /positions` returns it. */
export type DataPosition = {
  /** The proxy/funder wallet that holds the position. */
  proxyWallet: string;
  /** Token id of the outcome held. */
  asset: string;
  conditionId: string;
  /** Shares held. */
  size: number;
  avgPrice: number;
  /** Remaining entry basis, USDC. */
  initialValue: number;
  /** Mark-to-market value, USDC. */
  currentValue: number;
  /** Unrealized PnL, USDC. */
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  /** Current mark price. */
  curPrice: number;
  /** Market resolved in this outcome's favour — shares can be redeemed for $1 each. */
  redeemable: boolean;
  /** Both outcomes held — can be merged back to collateral. */
  mergeable: boolean;
  title: string;
  slug: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome?: string;
  oppositeAsset?: string;
  negativeRisk?: boolean;
  endDate?: string;
};

/**
 * Schema for one `GET /positions` row.
 *
 * @example
 * ```typescript
 * import { DataPositionSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, position] = DataPositionSchemaObject.safeParse({
 *   proxyWallet: '0x5268…', asset: '9595…', conditionId: '0x8a9d…', size: 131432.468,
 *   avgPrice: 0.4697, initialValue: 61742.06, currentValue: 0, cashPnl: -61742.06,
 *   percentPnl: -99.99, totalBought: 131432.468, realizedPnl: -1297.15,
 *   percentRealizedPnl: -100, curPrice: 0, redeemable: true, mergeable: false,
 *   title: 'Orioles vs. Rockies: O/U 11.5', slug: 'mlb-bal-col…', eventSlug: 'mlb-bal-col…',
 *   outcome: 'Over', outcomeIndex: 0,
 * });
 * ```
 */
export const DataPositionSchemaObject: BaseGuardian<DataPosition> = Guardian
  .object({
    proxyWallet: Guardian.string(),
    asset: Guardian.string(),
    conditionId: Guardian.string(),
    size: Guardian.number(),
    avgPrice: Guardian.number(),
    initialValue: Guardian.number(),
    currentValue: Guardian.number(),
    cashPnl: Guardian.number(),
    percentPnl: Guardian.number(),
    totalBought: Guardian.number(),
    realizedPnl: Guardian.number(),
    percentRealizedPnl: Guardian.number(),
    curPrice: Guardian.number(),
    redeemable: Guardian.boolean(),
    mergeable: Guardian.boolean(),
    title: Guardian.string(),
    slug: Guardian.string(),
    eventSlug: Guardian.string(),
    outcome: Guardian.string(),
    outcomeIndex: Guardian.number(),
    oppositeOutcome: Guardian.string().optional(),
    oppositeAsset: Guardian.string().optional(),
    negativeRisk: Guardian.boolean().optional(),
    endDate: Guardian.string().optional(),
  }).passthrough().describe({
    title: 'Data API position',
    description:
      'One open position of a wallet, with mark-to-market and PnL figures in USDC.',
  });

/** The `GET /positions` response — a bare array. */
export type DataPositionList = DataPosition[];

/**
 * Schema for the `GET /positions` response (a bare array; `null` from
 * the vendor normalizes to `[]`).
 *
 * @example
 * ```typescript
 * import { DataPositionListSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, positions] = DataPositionListSchemaObject.safeParse([]);
 * ```
 */
export const DataPositionListSchemaObject: BaseGuardian<DataPositionList> =
  Guardian.preprocess(
    (raw: unknown) => raw ?? [],
    Guardian.array(DataPositionSchemaObject),
  );

/** One entry of the `GET /value` response. */
export type DataValue = {
  user: string;
  /** Total mark-to-market value of the wallet's positions, USDC. */
  value: number;
};

/** The `GET /value` response — an array with one entry per requested user. */
export type DataValueList = DataValue[];

/**
 * Schema for the `GET /value` response.
 *
 * @example
 * ```typescript
 * import { DataValueListSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, values] = DataValueListSchemaObject.safeParse([{ user: '0x5268…', value: 122392.07 }]);
 * ```
 */
export const DataValueListSchemaObject: BaseGuardian<DataValueList> = Guardian
  .preprocess(
    (raw: unknown) => raw ?? [],
    Guardian.array(
      Guardian.object({
        user: Guardian.string(),
        value: Guardian.number(),
      }).passthrough(),
    ),
  );
