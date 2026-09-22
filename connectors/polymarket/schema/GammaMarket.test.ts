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

  it('validates a list of markets', () => {
    const list = GammaMarketListSchemaObject.parse([MINIMAL, {
      ...MINIMAL,
      id: '2',
    }]);
    asserts.assertEquals(list.length, 2);
  });
});
