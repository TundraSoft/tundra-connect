import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Pyth Pro (formerly Pyth Lazer) WebSocket payloads. Field names are the
 * venue's own (already camelCase). The i64 mantissas — `price`,
 * `bestBidPrice`, `bestAskPrice`, `emaPrice` — stay STRINGS: they can exceed
 * 2^53, and the exact value is the point. Real price = mantissa ×
 * 10^`exponent`. Timestamps are Unix MICROSECONDS. Every field the venue
 * adds passes through.
 */

const int = Guardian.number().strict();
const optionalInt = int.optional();
/** An i64 that the venue may send as a string or a number — kept as the exact string. */
const i64String = Guardian.preprocess(
  (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? String(v) : v,
  Guardian.string().pattern(/^-?\d+$/),
);

/** One feed's update inside a `streamUpdated` frame. Only the requested properties are present. */
export type PythPriceFeedUpdate = {
  /** Pyth Pro feed id (u32). */
  priceFeedId: number;
  /** Mantissa (i64, exact). Absent when the feed has no price yet. */
  price?: string;
  /** Mantissa (i64, exact). Experimental on the venue's side. */
  bestBidPrice?: string;
  /** Mantissa (i64, exact). Experimental on the venue's side. */
  bestAskPrice?: string;
  /** Mantissa (i64, exact). */
  emaPrice?: string;
  publisherCount?: number;
  /** Power of ten for every mantissa. */
  exponent?: number;
  confidence?: number;
  emaConfidence?: number;
  fundingRate?: number;
  /** Unix µs. */
  fundingTimestamp?: number;
  /** µs. */
  fundingRateInterval?: number;
  marketSession?: string;
  /** Unix µs the price was generated. Earlier than the frame's `timestampUs` means carried forward. */
  feedUpdateTimestamp?: number;
};

const _feed = Guardian.object({
  priceFeedId: int,
  price: i64String.optional(),
  bestBidPrice: i64String.optional(),
  bestAskPrice: i64String.optional(),
  emaPrice: i64String.optional(),
  publisherCount: optionalInt,
  exponent: optionalInt,
  confidence: Guardian.number().optional(),
  emaConfidence: Guardian.number().optional(),
  fundingRate: Guardian.number().optional(),
  fundingTimestamp: optionalInt,
  fundingRateInterval: optionalInt,
  marketSession: Guardian.string().optional(),
  feedUpdateTimestamp: optionalInt,
}).passthrough();

/**
 * Schema for one feed's entry in `parsed.priceFeeds`.
 *
 * @example
 * ```typescript
 * import { PythPriceFeedUpdateSchemaObject } from '@tundraconnect/pyth/schemas';
 *
 * const [error, feed] = PythPriceFeedUpdateSchemaObject.safeParse({
 *   priceFeedId: 1, price: '1006900000000', exponent: -8, publisherCount: 9,
 *   feedUpdateTimestamp: 1730986152400000,
 * });
 * ```
 */
export const PythPriceFeedUpdateSchemaObject: BaseGuardian<
  PythPriceFeedUpdate
> = _feed.describe({
  title: 'Pyth Pro price feed update',
  description: 'One feed in a Pyth Pro stream update.',
});

/** A signed binary payload for on-chain verification. */
export type PythBinaryPayload = {
  /** `hex` or `base64`. */
  encoding: string;
  data: string;
};

/** A `streamUpdated` frame. */
export type PythStreamUpdate = {
  type: 'streamUpdated';
  subscriptionId: number;
  parsed?: {
    /** Unix µs of this update (an integer string on the wire, a number here). */
    timestampUs: number;
    priceFeeds: PythPriceFeedUpdate[];
  };
  evm?: PythBinaryPayload;
  solana?: PythBinaryPayload;
  leEcdsa?: PythBinaryPayload;
  leUnsigned?: PythBinaryPayload;
  packedEvmEcdsa?: PythBinaryPayload;
};

const _binary = Guardian.object({
  encoding: Guardian.string(),
  data: Guardian.string(),
}).passthrough();

/**
 * Schema for a `streamUpdated` frame. `parsed.timestampUs` (an integer
 * string on the wire) becomes a number — µs since the epoch stays well below
 * 2^53.
 *
 * @example
 * ```typescript
 * import { PythStreamUpdateSchemaObject } from '@tundraconnect/pyth/schemas';
 *
 * const [error, update] = PythStreamUpdateSchemaObject.safeParse({
 *   type: 'streamUpdated', subscriptionId: 1,
 *   parsed: { timestampUs: '1730986152400000', priceFeeds: [{ priceFeedId: 1, price: '1006900000000' }] },
 * });
 * ```
 */
export const PythStreamUpdateSchemaObject: BaseGuardian<PythStreamUpdate> =
  Guardian.object({
    type: Guardian.literal('streamUpdated'),
    subscriptionId: int,
    parsed: Guardian.object({
      timestampUs: Guardian.preprocess(
        (v: unknown) =>
          typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v,
        int,
      ),
      priceFeeds: Guardian.array(_feed),
    }).passthrough().optional(),
    evm: _binary.optional(),
    solana: _binary.optional(),
    leEcdsa: _binary.optional(),
    leUnsigned: _binary.optional(),
    packedEvmEcdsa: _binary.optional(),
  }).passthrough().describe({
    title: 'Pyth Pro stream update',
    description: 'One `streamUpdated` frame.',
  });

/** Feed ids a subscription could not include, from `subscribedWithInvalidFeedIdsIgnored`. */
export type PythIgnoredFeeds = {
  unknownIds: number[];
  unknownSymbols: string[];
  unsupportedChannels: number[];
  unstable: number[];
};

/** A subscription acknowledgement (`subscribed` or `subscribedWithInvalidFeedIdsIgnored`). */
export type PythSubscribed = {
  type: 'subscribed' | 'subscribedWithInvalidFeedIdsIgnored';
  subscriptionId: number;
  subscribedFeedIds?: number[];
  ignoredInvalidFeedIds?: PythIgnoredFeeds;
};

/**
 * Schema for a subscription acknowledgement.
 *
 * @example
 * ```typescript
 * import { PythSubscribedSchemaObject } from '@tundraconnect/pyth/schemas';
 *
 * const [error, ack] = PythSubscribedSchemaObject.safeParse({ type: 'subscribed', subscriptionId: 1 });
 * ```
 */
export const PythSubscribedSchemaObject: BaseGuardian<PythSubscribed> = Guardian
  .object({
    type: Guardian.enum(
      ['subscribed', 'subscribedWithInvalidFeedIdsIgnored'] as const,
    ),
    subscriptionId: int,
    subscribedFeedIds: Guardian.array(int).optional(),
    ignoredInvalidFeedIds: Guardian.object({
      unknownIds: Guardian.array(int),
      unknownSymbols: Guardian.array(Guardian.string()),
      unsupportedChannels: Guardian.array(int),
      unstable: Guardian.array(int),
    }).passthrough().optional(),
  }).passthrough().describe({
    title: 'Pyth Pro subscription acknowledgement',
    description:
      'The venue accepted a subscription (possibly ignoring some feeds).',
  });
