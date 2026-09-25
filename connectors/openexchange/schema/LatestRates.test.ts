import * as asserts from '@asserts';
import { describe, it } from '@test';
import { LatestRatesSchemaObject } from './LatestRates.ts';

describe('OpenExchange.schema.LatestRates', () => {
  it('accepts a minimal latest rates response', () => {
    asserts.assertEquals(
      LatestRatesSchemaObject.safeParse({
        rates: { USD: 1, EUR: 0.9023 },
      })[0],
      null,
    );
  });

  it('rejects invalid currency rate maps', () => {
    asserts.assertExists(
      LatestRatesSchemaObject.safeParse({
        rates: { EU: -0.9023 },
      })[0],
    );
  });
});
