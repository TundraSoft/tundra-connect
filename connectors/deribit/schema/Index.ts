import { type BaseGuardian, Guardian } from '@guardian';
import { camelize } from './normalize.ts';

const n = () => Guardian.number().strict();

/** `deribit_price_index.<index>`: one price-index value. */
export type DeribitPriceIndexSchema = {
  /** e.g. `btc_usd`. */
  indexName: string;
  price: number;
  /** Unix ms. */
  timestamp: number;
} & Record<string, unknown>;

/**
 * Validates a price-index notification.
 *
 * @example
 * ```ts
 * import { DeribitPriceIndexSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [, p] = DeribitPriceIndexSchemaObject.safeParse({ index_name: 'btc_usd', price: 75927.05, timestamp: 1794003630646 });
 * console.log(p?.price);
 * ```
 */
export const DeribitPriceIndexSchemaObject: BaseGuardian<
  DeribitPriceIndexSchema
> = Guardian.preprocess(
  camelize,
  Guardian.object({
    indexName: Guardian.string(),
    price: n(),
    timestamp: n(),
  }).passthrough(),
) as BaseGuardian<DeribitPriceIndexSchema>;

/** `deribit_volatility_index.<index>`: one DVOL value. */
export type DeribitVolatilityIndexSchema = {
  /** e.g. `btc_usd`. */
  indexName: string;
  /** DVOL, annualised %. */
  volatility: number;
  /** Unix ms. */
  timestamp: number;
} & Record<string, unknown>;

/**
 * Validates a DVOL notification.
 *
 * @example
 * ```ts
 * import { DeribitVolatilityIndexSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [, v] = DeribitVolatilityIndexSchemaObject.safeParse({ index_name: 'btc_usd', volatility: 39.44, timestamp: 1794003630490 });
 * console.log(v?.volatility);
 * ```
 */
export const DeribitVolatilityIndexSchemaObject: BaseGuardian<
  DeribitVolatilityIndexSchema
> = Guardian.preprocess(
  camelize,
  Guardian.object({
    indexName: Guardian.string(),
    volatility: n(),
    timestamp: n(),
  }).passthrough(),
) as BaseGuardian<DeribitVolatilityIndexSchema>;

/** One option's mark from `markprice.options.<index>`. */
export type DeribitMarkPriceSchema = {
  instrumentName: string;
  markPrice: number;
  /** Mark implied volatility as a fraction (0.3965 = 39.65%), unlike the ticker's percent. */
  iv: number;
  /** Unix ms. */
  timestamp: number;
} & Record<string, unknown>;

/**
 * Validates one option mark entry.
 *
 * @example
 * ```ts
 * import { DeribitMarkPriceSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [, m] = DeribitMarkPriceSchemaObject.safeParse({ instrument_name: 'BTC-9NOV26-79500-P', mark_price: 0.0473, iv: 0.305, timestamp: 1794003630724 });
 * console.log(m?.iv);
 * ```
 */
export const DeribitMarkPriceSchemaObject: BaseGuardian<
  DeribitMarkPriceSchema
> = Guardian.preprocess(
  camelize,
  Guardian.object({
    instrumentName: Guardian.string().minLength(1),
    markPrice: n(),
    iv: n(),
    timestamp: n(),
  }).passthrough(),
) as BaseGuardian<DeribitMarkPriceSchema>;

/** `public/get_index_price`. */
export type DeribitIndexPriceSchema = {
  indexPrice: number;
  estimatedDeliveryPrice: number;
} & Record<string, unknown>;

/**
 * Validates `public/get_index_price`.
 *
 * @example
 * ```ts
 * import { DeribitIndexPriceSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [, p] = DeribitIndexPriceSchemaObject.safeParse({ index_price: 1, estimated_delivery_price: 1 });
 * console.log(p?.indexPrice);
 * ```
 */
export const DeribitIndexPriceSchemaObject: BaseGuardian<
  DeribitIndexPriceSchema
> = Guardian.preprocess(
  camelize,
  Guardian.object({
    indexPrice: n(),
    estimatedDeliveryPrice: n(),
  }).passthrough(),
) as BaseGuardian<DeribitIndexPriceSchema>;

/** `[timestamp, open, high, low, close]` of one DVOL candle. */
export type DeribitVolatilityCandleSchema = [
  number,
  number,
  number,
  number,
  number,
];

/** `public/get_volatility_index_data`: DVOL candles. */
export type DeribitVolatilityIndexDataSchema = {
  /** Candles, as Deribit sends them. */
  data: DeribitVolatilityCandleSchema[];
  /** Pass as `endTimestamp` to fetch the next (older) page; `null` when done. */
  continuation: number | null;
} & Record<string, unknown>;

/**
 * Validates DVOL candle data.
 *
 * @example
 * ```ts
 * import { DeribitVolatilityIndexDataSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [, d] = DeribitVolatilityIndexDataSchemaObject.safeParse({ data: [[1, 2, 3, 1, 2]], continuation: null });
 * console.log(d?.data.length);
 * ```
 */
export const DeribitVolatilityIndexDataSchemaObject: BaseGuardian<
  DeribitVolatilityIndexDataSchema
> = Guardian.object({
  data: Guardian.array(
    Guardian.unknown<DeribitVolatilityCandleSchema>().test(
      (c) =>
        Array.isArray(c) && c.length === 5 &&
        c.every((x) => typeof x === 'number'),
      'expected [timestamp, open, high, low, close]',
    ),
  ),
  continuation: n().nullable(),
}).passthrough() as BaseGuardian<DeribitVolatilityIndexDataSchema>;
