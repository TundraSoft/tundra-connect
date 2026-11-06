import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  FeeScheduleSchemaObject,
  GammaMarketListSchemaObject,
  GammaMarketSchemaObject,
} from './GammaMarket.ts';

const MINIMAL = {
  id: '1',
  question: 'Q?',
  conditionId: '0x1',
  slug: 's',
};

describe('GammaMarket', () => {
  it('parses native array outcomes', () => {
    const market = GammaMarketSchemaObject.parse({
      ...MINIMAL,
      outcomes: ['Yes', 'No'],
      clobTokenIds: ['a', 'b'],
      active: true,
      closed: false,
      archived: false,
    });
    asserts.assertEquals(market.outcomes, ['Yes', 'No']);
    asserts.assertEquals(market.clobTokenIds, ['a', 'b']);
  });

  it('parses string-encoded outcomes', () => {
    const market = GammaMarketSchemaObject.parse({
      ...MINIMAL,
      outcomes: '["Yes", "No"]',
      clobTokenIds: '["a","b"]',
      active: true,
      closed: false,
      archived: false,
    });
    asserts.assertEquals(market.outcomes, ['Yes', 'No']);
    asserts.assertEquals(market.clobTokenIds, ['a', 'b']);
  });

  it('tolerates missing optional fields, defaulting the boolean flags to false', () => {
    const market = GammaMarketSchemaObject.parse(MINIMAL);
    asserts.assertEquals(market.active, false);
    asserts.assertEquals(market.closed, false);
    asserts.assertEquals(market.negRisk, false);
    asserts.assertEquals(market.outcomes, []);
    asserts.assertEquals(market.bestBid, undefined);
    asserts.assertEquals(market.umaResolutionStatus, undefined);
  });

  it('parses umaResolutionStatus, including an explicit null (pre-proposal)', () => {
    const resolved = GammaMarketSchemaObject.parse({
      ...MINIMAL,
      umaResolutionStatus: 'resolved',
    });
    asserts.assertEquals(resolved.umaResolutionStatus, 'resolved');

    const pending = GammaMarketSchemaObject.parse({
      ...MINIMAL,
      umaResolutionStatus: null,
    });
    asserts.assertEquals(pending.umaResolutionStatus, null);
  });

  it('rejects a required field that is missing', () => {
    asserts.assertThrows(() =>
      GammaMarketSchemaObject.parse({ question: 'Q?' })
    );
  });

  it('keeps unmodeled vendor fields via passthrough', () => {
    const market = GammaMarketSchemaObject.parse({
      ...MINIMAL,
      someFutureField: 'kept',
    }) as unknown as Record<string, unknown>;
    asserts.assertEquals(market.someFutureField, 'kept');
  });

  it('parses a fee schedule, defaulting rebateRate/takerOnly to absent', () => {
    const fees = FeeScheduleSchemaObject.parse({ rate: 0.07, exponent: 1 });
    asserts.assertEquals(fees.rate, 0.07);
    asserts.assertEquals(fees.rebateRate, undefined);
    asserts.assertEquals(fees.takerOnly, undefined);
  });

  it('types the fee, crypto-TWAP, resolution and protocol fields of a live up/down market', () => {
    // Live-shaped (gamma-api /markets/keyset, 2026-11-06), trimmed.
    const market = GammaMarketSchemaObject.parse({
      ...MINIMAL,
      slug: 'sol-updown-5m-1794090000',
      eventStartTime: '2026-11-07T22:20:00Z',
      feesEnabled: true,
      feeType: 'crypto_fees_v2',
      feeSchedule: {
        exponent: 1,
        rate: 0.07,
        takerOnly: true,
        rebateRate: 0.2,
      },
      takerBaseFee: 1000,
      makerBaseFee: 1000,
      cryptoMarketConfig: {
        id: 'sol-5m-twap-60',
        asset: 'sol',
        duration: '5m',
        twapEnabled: true,
        twapLookbackSeconds: 60,
      },
      resolutionMechanism: 'oracle',
      fallbackResolutionType: 'none',
      clearBookOnStart: true,
      rfqEnabled: false,
      version: 'v1',
      makerRebatesFeeShareBps: 10000,
    });
    asserts.assertEquals(market.feeSchedule?.rate, 0.07);
    asserts.assertEquals(market.feeSchedule?.takerOnly, true);
    asserts.assertEquals(market.feeType, 'crypto_fees_v2');
    asserts.assertEquals(market.takerBaseFee, 1000);
    asserts.assertEquals(market.cryptoMarketConfig?.twapLookbackSeconds, 60);
    asserts.assertEquals(market.cryptoMarketConfig?.asset, 'sol');
    asserts.assertEquals(market.resolutionMechanism, 'oracle');
    asserts.assertEquals(market.fallbackResolutionType, 'none');
    asserts.assertEquals(market.eventStartTime, '2026-11-07T22:20:00Z');
    asserts.assertEquals(market.clearBookOnStart, true);
    asserts.assertEquals(market.rfqEnabled, false);
    asserts.assertEquals(market.version, 'v1');
    asserts.assertEquals(
      (market as unknown as { makerRebatesFeeShareBps: number })
        .makerRebatesFeeShareBps,
      10000,
    );
  });

  it('accepts null for the optional new fields, rejects a malformed TWAP config', () => {
    const market = GammaMarketSchemaObject.parse({
      ...MINIMAL,
      feeSchedule: null,
      cryptoMarketConfig: null,
      version: null,
      positionIds: null,
    });
    asserts.assertEquals(market.feeSchedule, null);
    asserts.assertExists(
      GammaMarketSchemaObject.safeParse({
        ...MINIMAL,
        cryptoMarketConfig: {
          asset: 'btc',
          duration: '5m',
          twapEnabled: 'yes',
        },
      })[0],
    );
  });

  it('validates a list of markets', () => {
    const list = GammaMarketListSchemaObject.parse([MINIMAL, {
      ...MINIMAL,
      id: '2',
    }]);
    asserts.assertEquals(list.length, 2);
  });
});
