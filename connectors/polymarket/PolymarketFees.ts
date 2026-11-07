/**
 * @fileoverview Polymarket trading-fee arithmetic, read from a market's own
 * `feeSchedule` (https://docs.polymarket.com/trading/fees):
 *
 * `fee = shares × feeRate × (p × (1 − p))^exponent`
 *
 * — symmetric around `p = 0.5`, rounded to 5 decimals (the venue's
 * smallest fee is 0.00001 USDC). Every live schedule has `exponent: 1`,
 * which is the documented `shares × feeRate × p × (1 − p)`. Fees are
 * charged at match time — never part of a signed order — on the BUY side
 * as extra collateral spend, on the SELL side as a deduction from proceeds.
 * With `takerOnly`, makers pay nothing and earn back `rebateRate` of the
 * taker fee (paid daily from the pool, so per fill it is an estimate).
 *
 * Pure: no I/O, nothing cached, no rate assumed — a market without a
 * schedule, or with fees disabled, costs nothing.
 *
 * @module
 */

import type { FeeSchedule } from './schema/mod.ts';

/** What {@link estimateFees} reads off a market — a `GammaMarket` satisfies it. */
export type FeeSource = {
  feesEnabled?: boolean | null;
  feeSchedule?: FeeSchedule | null;
};

/** Result of {@link estimateFees}, USDC. */
export type FeeEstimate = {
  /** Fee the taker pays on this fill. */
  takerFee: number;
  /** Fee the resting maker pays — `0` on a `takerOnly` schedule. */
  makerFee: number;
  /** The maker's share of `takerFee` under `rebateRate` (an estimate — rebates are paid daily from a pool). */
  makerRebate: number;
};

const FEE_DECIMALS = 1e5;

const round5 = (value: number): number =>
  Math.round(value * FEE_DECIMALS) / FEE_DECIMALS;

/**
 * Fees for a fill of `shares` at `price` on `market`, from the market's own
 * `feeSchedule` — never a hard-coded rate.
 *
 * @param market - A Gamma market (or anything with `feesEnabled`/`feeSchedule`).
 * @param fill.price - Execution price per share, in `(0, 1)`.
 * @param fill.shares - Shares filled.
 * @throws {RangeError} When `price` is outside `[0, 1]` or `shares` is negative or not finite.
 *
 * @example
 * ```typescript
 * import { estimateFees } from '@tundraconnect/polymarket';
 *
 * declare const market: import('@tundraconnect/polymarket').GammaMarket;
 * const { takerFee, makerRebate } = estimateFees(market, { price: 0.5, shares: 100 });
 * // crypto (rate 0.07, rebate 0.2): takerFee 1.75, makerRebate 0.35
 * ```
 */
export function estimateFees(
  market: FeeSource,
  fill: { price: number; shares: number },
): FeeEstimate {
  const { price, shares } = fill;
  if (!Number.isFinite(price) || price < 0 || price > 1) {
    throw new RangeError(`price must be within [0, 1], got ${price}`);
  }
  if (!Number.isFinite(shares) || shares < 0) {
    throw new RangeError(`shares must be a non-negative number, got ${shares}`);
  }
  const schedule = market.feeSchedule;
  if (!schedule || market.feesEnabled === false) {
    return { takerFee: 0, makerFee: 0, makerRebate: 0 };
  }
  const curve = Math.pow(price * (1 - price), schedule.exponent);
  const fee = round5(shares * schedule.rate * curve);
  const takerOnly = schedule.takerOnly === true;
  return {
    takerFee: fee,
    makerFee: takerOnly ? 0 : fee,
    makerRebate: takerOnly ? round5(fee * (schedule.rebateRate ?? 0)) : 0,
  };
}
