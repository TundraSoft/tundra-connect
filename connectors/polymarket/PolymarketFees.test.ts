import * as asserts from '@asserts';
import { describe, it } from '@test';
import { estimateFees } from './PolymarketFees.ts';

const CRYPTO = {
  feesEnabled: true,
  feeSchedule: { rate: 0.07, exponent: 1, takerOnly: true, rebateRate: 0.2 },
};

describe('estimateFees', () => {
  it('shares × rate × p × (1 − p) from the market schedule; makers pay nothing on takerOnly', () => {
    asserts.assertEquals(estimateFees(CRYPTO, { price: 0.5, shares: 100 }), {
      takerFee: 1.75,
      makerFee: 0,
      makerRebate: 0.35,
    });
  });

  it('is symmetric around 0.5 and reads the market’s own rate', () => {
    const sports = {
      feeSchedule: {
        rate: 0.05,
        exponent: 1,
        takerOnly: true,
        rebateRate: 0.15,
      },
    };
    const at30 = estimateFees(sports, { price: 0.3, shares: 100 });
    const at70 = estimateFees(sports, { price: 0.7, shares: 100 });
    asserts.assertEquals(at30.takerFee, 1.05);
    asserts.assertEquals(at70.takerFee, at30.takerFee);
  });

  it('rounds to 5 decimals: tiny fills near the edges cost nothing', () => {
    asserts.assertEquals(
      estimateFees(CRYPTO, { price: 0.999, shares: 0.01 }).takerFee,
      0,
    );
    asserts.assertEquals(
      estimateFees(CRYPTO, { price: 0.37, shares: 13.3 }).takerFee,
      0.21702, // 13.3 × 0.07 × 0.37 × 0.63 = 0.2170161…
    );
  });

  it('applies the exponent to the price component', () => {
    const fee = estimateFees(
      { feeSchedule: { rate: 0.25, exponent: 2 } },
      { price: 0.5, shares: 100 },
    );
    asserts.assertEquals(fee.takerFee, 1.5625);
    // Not takerOnly: the maker pays the same curve and earns no rebate.
    asserts.assertEquals(fee.makerFee, 1.5625);
    asserts.assertEquals(fee.makerRebate, 0);
  });

  it('no schedule, or fees disabled, costs nothing', () => {
    const zero = { takerFee: 0, makerFee: 0, makerRebate: 0 };
    asserts.assertEquals(estimateFees({}, { price: 0.5, shares: 10 }), zero);
    asserts.assertEquals(
      estimateFees({ feeSchedule: null }, { price: 0.5, shares: 10 }),
      zero,
    );
    asserts.assertEquals(
      estimateFees({ ...CRYPTO, feesEnabled: false }, {
        price: 0.5,
        shares: 10,
      }),
      zero,
    );
  });

  it('rejects an out-of-range price or a negative size', () => {
    asserts.assertThrows(
      () => estimateFees(CRYPTO, { price: 1.2, shares: 1 }),
      RangeError,
    );
    asserts.assertThrows(
      () => estimateFees(CRYPTO, { price: 0.5, shares: -1 }),
      RangeError,
    );
  });
});
