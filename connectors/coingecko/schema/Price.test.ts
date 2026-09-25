import * as asserts from '@asserts';
import { describe, it } from '@test';
import { PriceSchemaObject } from './Price.ts';

describe('CoinGecko.schema.Price', () => {
  it('accepts a documented price response', () => {
    const [error, prices] = PriceSchemaObject.safeParse({
      bitcoin: {
        usd: 65000.5,
        usd_market_cap: 1_280_000_000_000,
        usd_24h_vol: 25_000_000_000,
        usd_24h_change: 1.23,
        last_updated_at: 1_703_971_200,
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(prices?.bitcoin?.usd, 65000.5);
  });

  it('accepts an empty object for an unknown coin id', () => {
    const [error, prices] = PriceSchemaObject.safeParse({});
    asserts.assertEquals(error, null);
    asserts.assertEquals(prices, {});
  });

  it('rejects non-numeric currency values', () => {
    asserts.assertExists(
      PriceSchemaObject.safeParse({ bitcoin: { usd: 'a lot' } })[0],
    );
  });

  it('rejects a non-object payload', () => {
    asserts.assertExists(PriceSchemaObject.safeParse('bitcoin')[0]);
    asserts.assertExists(PriceSchemaObject.safeParse(null)[0]);
  });
});
