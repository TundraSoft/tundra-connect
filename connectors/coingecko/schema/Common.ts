import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Common schema components for CoinGecko API responses
 *
 * This module provides reusable Guardian validation components shared
 * across multiple CoinGecko endpoint schemas.
 *
 * @example
 * ```typescript
 * import { coinIdGuard, RoiSchemaObject } from '@tundraconnect/coingecko/schemas';
 *
 * const [error, id] = coinIdGuard.safeParse('bitcoin');
 * ```
 */

/** Validates a CoinGecko coin id (e.g. `bitcoin`). */
export const coinIdGuard: BaseGuardian<string> = Guardian.string().minLength(
  1,
);

/** Validates a coin ticker symbol (e.g. `btc`). */
export const coinSymbolGuard: BaseGuardian<string> = Guardian.string()
  .minLength(1);

/** Validates a coin display name (e.g. `Bitcoin`). */
export const coinNameGuard: BaseGuardian<string> = Guardian.string()
  .minLength(1);

/** Type definition for a coin's ROI summary. */
export interface RoiSchema {
  /** Multiple of the original investment (e.g. `96.4` = 96.4x). */
  times: number;
  /** Currency the ROI figures are denominated in. */
  currency: string;
  /** ROI expressed as a percentage. */
  percentage: number;
}

/**
 * Schema for a coin's return-on-investment summary, as returned within
 * `/coins/markets` entries. `null` when the vendor has no ROI data for the
 * coin — model the nullability at the call site with `.nullable()`.
 *
 * @example
 * ```typescript
 * import { RoiSchemaObject } from '@tundraconnect/coingecko/schemas';
 *
 * const [error, roi] = RoiSchemaObject.safeParse({
 *   times: 96.4,
 *   currency: 'usd',
 *   percentage: 9640.5,
 * });
 * ```
 */
export const RoiSchemaObject: BaseGuardian<RoiSchema> = Guardian.object({
  /** Multiple of the original investment (e.g. `96.4` = 96.4x). */
  times: Guardian.number(),
  /** Currency the ROI figures are denominated in. */
  currency: Guardian.string(),
  /** ROI expressed as a percentage. */
  percentage: Guardian.number(),
}).describe({
  title: 'Coin ROI summary',
  description: 'Return-on-investment summary for a coin, when available.',
});
