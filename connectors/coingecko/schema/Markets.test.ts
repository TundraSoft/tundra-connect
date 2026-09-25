import * as asserts from '@asserts';
import { describe, it } from '@test';
import { MarketDataSchemaObject, MarketsSchemaObject } from './Markets.ts';

const validMarket = {
  id: 'bitcoin',
  symbol: 'btc',
  name: 'Bitcoin',
  image: 'https://example.com/bitcoin.png',
  current_price: 65000.5,
  market_cap: 1_280_000_000_000,
  market_cap_rank: 1,
  total_volume: 25_000_000_000,
  high_24h: 66000,
  low_24h: 64000,
  price_change_24h: 500,
  price_change_percentage_24h: 0.77,
  circulating_supply: 19_700_000,
  total_supply: 21_000_000,
  max_supply: 21_000_000,
  ath: 73750,
  ath_date: '2024-03-14T07:10:36.635Z',
  atl: 67.81,
  atl_date: '2013-07-06T00:00:00.000Z',
  roi: null,
  last_updated: '2024-06-01T00:00:00.000Z',
};

describe('CoinGecko.schema.Markets', () => {
  it('accepts a fully-populated market entry', () => {
    const [error, market] = MarketDataSchemaObject.safeParse(validMarket);
    asserts.assertEquals(error, null);
    asserts.assertEquals(market?.id, 'bitcoin');
    asserts.assertEquals(market?.roi, null);
  });

  it('accepts a market entry with a populated roi object', () => {
    const [error, market] = MarketDataSchemaObject.safeParse({
      ...validMarket,
      roi: { times: 96.4, currency: 'usd', percentage: 9640.5 },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(market?.roi?.times, 96.4);
  });

  it('accepts null for thin-market fields', () => {
    const [error, market] = MarketDataSchemaObject.safeParse({
      ...validMarket,
      market_cap_rank: null,
      total_supply: null,
      max_supply: null,
      high_24h: null,
      low_24h: null,
      price_change_24h: null,
      price_change_percentage_24h: null,
      circulating_supply: null,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(market?.max_supply, null);
  });

  it('rejects a negative current_price', () => {
    asserts.assertExists(
      MarketDataSchemaObject.safeParse({
        ...validMarket,
        current_price: -1,
      })[0],
    );
  });

  it('rejects a non-integer market_cap_rank', () => {
    asserts.assertExists(
      MarketDataSchemaObject.safeParse({
        ...validMarket,
        market_cap_rank: 1.5,
      })[0],
    );
  });

  it('rejects an entry missing required fields', () => {
    asserts.assertExists(
      MarketDataSchemaObject.safeParse({ id: 'bitcoin' })[0],
    );
  });

  it('validates an array of markets', () => {
    const [error, markets] = MarketsSchemaObject.safeParse([validMarket]);
    asserts.assertEquals(error, null);
    asserts.assertEquals(markets?.length, 1);
  });

  it('accepts an empty markets array', () => {
    const [error, markets] = MarketsSchemaObject.safeParse([]);
    asserts.assertEquals(error, null);
    asserts.assertEquals(markets, []);
  });

  it('rejects a non-array payload', () => {
    asserts.assertExists(MarketsSchemaObject.safeParse(validMarket)[0]);
  });
});
