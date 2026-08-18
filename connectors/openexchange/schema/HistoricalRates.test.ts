import * as asserts from '@asserts';
import { describe, it } from '@test';
import { HistoricalRatesSchemaObject } from './HistoricalRates.ts';

describe('OpenExchange.schema.HistoricalRates', () => {
  it('accepts historical rate responses', () => {
    asserts.assertEquals(
      HistoricalRatesSchemaObject.safeParse({
        timestamp: 1703894400,
        base: 'USD',
        rates: { EUR: 0.8945 },
      })[0],
      null,
    );
  });

  it('does not require a historical flag — the vendor never sends one', () => {
    asserts.assertEquals(
      HistoricalRatesSchemaObject.safeParse({
        timestamp: 1703894400,
        rates: { EUR: 0.8945 },
      })[0],
      null,
    );
  });

  it('rejects a response missing the required timestamp', () => {
    asserts.assertExists(
      HistoricalRatesSchemaObject.safeParse({
        base: 'USD',
        rates: { EUR: 0.8945 },
      })[0],
    );
  });
});
