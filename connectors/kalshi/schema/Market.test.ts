import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  isSettledStatus,
  MarketSchemaObject,
  MarketsPageSchemaObject,
  SingleMarketSchemaObject,
} from './Market.ts';

const RAW_OPEN_MARKET = {
  ticker: 'KXBTCD-26JUL1515-T71799.99',
  event_ticker: 'KXBTCD-26JUL1515',
  market_type: 'binary',
  yes_sub_title: '$71,800 or above',
  no_sub_title: '$71,800 or above',
  open_time: '2026-07-15T18:00:00Z',
  close_time: '2026-07-15T19:00:00Z',
  status: 'active',
  result: '',
  yes_bid_dollars: '0.0000',
  yes_ask_dollars: '0.0100',
  no_bid_dollars: '0.9900',
  no_ask_dollars: '1.0000',
  last_price_dollars: '0.0000',
  volume_fp: '1234.00',
  open_interest_fp: '56.00',
};

describe('Market schema', () => {
  it('parses a market and coerces fixed-point strings to numbers', () => {
    const market = MarketSchemaObject.parse(RAW_OPEN_MARKET);
    asserts.assertEquals(market.ticker, 'KXBTCD-26JUL1515-T71799.99');
    asserts.assertEquals(market.eventTicker, 'KXBTCD-26JUL1515');
    asserts.assertEquals(market.yesAsk, 0.01);
    asserts.assertEquals(market.volume, 1234);
  });

  it('derives seriesTicker from the event ticker prefix', () => {
    const market = MarketSchemaObject.parse(RAW_OPEN_MARKET);
    asserts.assertEquals(market.seriesTicker, 'KXBTCD');
  });

  it('parses a settled market with a settlement result', () => {
    const market = MarketSchemaObject.parse({
      ...RAW_OPEN_MARKET,
      status: 'finalized',
      result: 'no',
      settlement_value_dollars: '0.0000',
    });
    asserts.assert(isSettledStatus(market.status));
    asserts.assertEquals(market.result, 'no');
    asserts.assertEquals(market.settlementValue, 0);
  });

  it('is not settled for an active market', () => {
    asserts.assertEquals(isSettledStatus('active'), false);
    asserts.assertEquals(isSettledStatus('initialized'), false);
  });

  it('parses a markets page with a cursor', () => {
    const page = MarketsPageSchemaObject.parse({
      cursor: 'CgwI0PXX0gYQyKLlxAE',
      markets: [RAW_OPEN_MARKET],
    });
    asserts.assertEquals(page.markets.length, 1);
    asserts.assertEquals(page.cursor, 'CgwI0PXX0gYQyKLlxAE');
  });

  it('defaults an absent markets array to empty', () => {
    const page = MarketsPageSchemaObject.parse({});
    asserts.assertEquals(page.markets, []);
  });

  it('unwraps the { market: ... } single-market response envelope', () => {
    const market = SingleMarketSchemaObject.parse({ market: RAW_OPEN_MARKET });
    asserts.assertEquals(market.ticker, RAW_OPEN_MARKET.ticker);
  });

  it('keeps unmodeled vendor fields via passthrough', () => {
    const market = MarketSchemaObject.parse({
      ...RAW_OPEN_MARKET,
      strike_type: 'greater_or_equal',
      floor_strike: 71799.99,
    }) as unknown as Record<string, unknown>;
    asserts.assertEquals(market.strike_type, 'greater_or_equal');
  });

  it('rejects a market missing the required ticker', () => {
    asserts.assertThrows(() =>
      MarketSchemaObject.parse({ event_ticker: 'E', status: 'active' })
    );
  });
});
