import { type BaseGuardian, Guardian } from '@guardian';

/** One resting price level: `price` in dollars `[0.01, 0.99]`, `count` in contracts. */
export type OrderbookLevel = {
  price: number;
  count: number;
};

/**
 * A market's order book. Kalshi's single-book model returns BIDS ONLY on
 * both legs — a YES bid at price `p` is economically a NO ask at
 * `1 - p`, so the two bid-only arrays fully describe the book without a
 * separate ask side.
 */
export type Orderbook = {
  yes: OrderbookLevel[];
  no: OrderbookLevel[];
};

/**
 * Unwraps each `[price, count]` wire tuple into `{price, count}`, still as
 * whatever raw (string) values the vendor sent — `Guardian.number()`
 * coerces them below, and (unlike a hand-rolled `Number(x)`) correctly
 * rejects an empty/garbage value instead of silently producing `0`/`NaN`.
 */
function toLevels(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is [unknown, unknown] =>
      Array.isArray(row) && row.length === 2
    )
    .map(([price, count]) => ({ price, count }));
}

/**
 * Schema for the `GET /markets/{ticker}/orderbook` response. The vendor
 * shape is `{ orderbook_fp: { yes_dollars: [[price, count], ...], no_dollars: [...] } }`
 * — each level a 2-element `[priceString, countString]` tuple, unwrapped
 * and coerced to `{price, count}` numbers here.
 *
 * @example
 * ```typescript
 * import { OrderbookSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, book] = OrderbookSchemaObject.safeParse({
 *   orderbook_fp: { yes_dollars: [['0.15', '100.00']], no_dollars: [] },
 * });
 * ```
 */
export const OrderbookSchemaObject: BaseGuardian<Orderbook> = Guardian
  .preprocess(
    (raw: unknown) => {
      const fp = (typeof raw === 'object' && raw !== null)
        ? (raw as Record<string, unknown>).orderbook_fp
        : undefined;
      const obj = (typeof fp === 'object' && fp !== null)
        ? (fp as Record<string, unknown>)
        : {};
      return {
        yes: toLevels(obj.yes_dollars),
        no: toLevels(obj.no_dollars),
      };
    },
    Guardian.object({
      yes: Guardian.array(
        Guardian.object({ price: Guardian.number(), count: Guardian.number() }),
      ),
      no: Guardian.array(
        Guardian.object({ price: Guardian.number(), count: Guardian.number() }),
      ),
    }).describe({
      title: 'Kalshi orderbook',
      description: 'Resting bid levels for a market’s YES and NO legs.',
    }),
  );
