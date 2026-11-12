import { type BaseGuardian, Guardian } from '@guardian';
import { camelize } from './normalize.ts';

/** One level of a `book.*` notification. */
export type DeribitBookLevelChangeSchema = {
  /** `new`, `change` or `delete` (a delete carries amount 0). */
  action: 'new' | 'change' | 'delete';
  price: number;
  amount: number;
};

/**
 * One `book.<instrument>.<interval>` notification: the venue's snapshot,
 * then every change at full depth. Each change's `prevChangeId` is the
 * previous notification's `changeId`; a mismatch is a missed update.
 */
export type DeribitBookUpdateSchema = {
  /** `snapshot` (full book) or `change` (deltas). */
  type: 'snapshot' | 'change';
  instrumentName: string;
  /** Unix ms. */
  timestamp: number;
  changeId: number;
  /** Absent on a snapshot. */
  prevChangeId?: number;
  bids: DeribitBookLevelChangeSchema[];
  asks: DeribitBookLevelChangeSchema[];
} & Record<string, unknown>;

const changes = (levels: unknown): unknown =>
  Array.isArray(levels)
    ? levels.map((l) =>
      Array.isArray(l) ? { action: l[0], price: l[1], amount: l[2] } : l
    )
    : levels;

const level = Guardian.object({
  action: Guardian.enum(['new', 'change', 'delete'] as const),
  price: Guardian.number().strict(),
  amount: Guardian.number().strict(),
});

/**
 * Validates a `book.*` notification; `[action, price, amount]` triples
 * become level objects.
 *
 * @example
 * ```ts
 * import { DeribitBookUpdateSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [error, book] = DeribitBookUpdateSchemaObject.safeParse({
 *   type: 'change', instrument_name: 'BTC-PERPETUAL', timestamp: 1794003630805,
 *   change_id: 181673602518, prev_change_id: 181673602504,
 *   bids: [['delete', 75943.5, 0]], asks: [['new', 75961, 6600]],
 * });
 * if (!error) console.log(book.bids[0]?.action);
 * ```
 */
export const DeribitBookUpdateSchemaObject: BaseGuardian<
  DeribitBookUpdateSchema
> = Guardian.preprocess(
  (raw: unknown) => {
    const value = camelize(raw) as Record<string, unknown> | unknown;
    if (typeof value !== 'object' || value === null) return value;
    const v = value as Record<string, unknown>;
    return { ...v, bids: changes(v.bids), asks: changes(v.asks) };
  },
  Guardian.object({
    type: Guardian.enum(['snapshot', 'change'] as const),
    instrumentName: Guardian.string().minLength(1),
    timestamp: Guardian.number().strict(),
    changeId: Guardian.number().strict().integer(),
    prevChangeId: Guardian.number().strict().integer().optional(),
    bids: Guardian.array(level),
    asks: Guardian.array(level),
  }).passthrough().describe({
    title: 'Deribit book update',
    description: 'A book snapshot or set of changes, chained by change ids.',
  }),
) as BaseGuardian<DeribitBookUpdateSchema>;

/** One resting level of a book snapshot. */
export type DeribitBookLevelSchema = { price: number; amount: number };

/** `public/get_order_book`: a full snapshot to rebuild from after a gap. */
export type DeribitOrderBookSchema = {
  instrumentName: string;
  timestamp: number;
  /** Same sequence as the `book.*` channel's `changeId`. */
  changeId: number;
  state: string;
  bids: DeribitBookLevelSchema[];
  asks: DeribitBookLevelSchema[];
} & Record<string, unknown>;

const levels = (raw: unknown): unknown =>
  Array.isArray(raw)
    ? raw.map((l) => Array.isArray(l) ? { price: l[0], amount: l[1] } : l)
    : raw;

const resting = Guardian.object({
  price: Guardian.number().strict(),
  amount: Guardian.number().strict(),
});

/**
 * Validates an order-book snapshot; `[price, amount]` pairs become level
 * objects. The ticker fields Deribit includes are kept, camelCased.
 *
 * @example
 * ```ts
 * import { DeribitOrderBookSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * declare const raw: unknown;
 * const [error, book] = DeribitOrderBookSchemaObject.safeParse(raw);
 * if (!error) console.log(book.changeId, book.bids[0]);
 * ```
 */
export const DeribitOrderBookSchemaObject: BaseGuardian<
  DeribitOrderBookSchema
> = Guardian.preprocess(
  (raw: unknown) => {
    const value = camelize(raw);
    if (typeof value !== 'object' || value === null) return value;
    const v = value as Record<string, unknown>;
    return { ...v, bids: levels(v.bids), asks: levels(v.asks) };
  },
  Guardian.object({
    instrumentName: Guardian.string().minLength(1),
    timestamp: Guardian.number().strict(),
    changeId: Guardian.number().strict().integer(),
    state: Guardian.string(),
    bids: Guardian.array(resting),
    asks: Guardian.array(resting),
  }).passthrough(),
) as BaseGuardian<DeribitOrderBookSchema>;
