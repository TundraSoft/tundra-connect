import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DeribitAuthResultSchemaObject,
  DeribitBookSummarySchemaObject,
  DeribitBookUpdateSchemaObject,
  DeribitInstrumentSchemaObject,
  DeribitMarkPriceSchemaObject,
  DeribitOrderBookSchemaObject,
  DeribitTickerSchemaObject,
  DeribitTradeSchemaObject,
  DeribitTradesPageSchemaObject,
  DeribitVolatilityIndexDataSchemaObject,
} from './mod.ts';

const RAW_TRADE = {
  timestamp: 1794003632876,
  price: 75947.5,
  direction: 'sell',
  index_price: 75927.33,
  instrument_name: 'BTC-PERPETUAL',
  trade_seq: 315282656,
  amount: 450.0,
  mark_price: 75947.52,
  tick_direction: 2,
  starbase_match_id: '244586781347950592',
  trade_id: '462303753',
  contracts: 45.0,
  starbase_timestamp: '1794003632876548820',
};

describe('Deribit.schema', () => {
  it('camelCases an instrument and keeps unknown fields', () => {
    const [error, inst] = DeribitInstrumentSchemaObject.safeParse({
      state: 'open',
      price_index: 'btc_usd',
      kind: 'option',
      instrument_name: 'BTC-7NOV26-68000-C',
      expiration_timestamp: 1794038400000,
      creation_timestamp: 1793692810000,
      is_active: true,
      tick_size: 0.0001,
      contract_size: 1.0,
      strike: 68000.0,
      option_type: 'call',
      min_trade_amount: 0.1,
      settlement_period: 'day',
      base_currency: 'BTC',
      quote_currency: 'BTC',
      tick_size_steps: [{ tick_size: 0.0005, above_price: 0.005 }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(inst?.instrumentName, 'BTC-7NOV26-68000-C');
    asserts.assertEquals(inst?.tickSizeSteps, [{
      tickSize: 0.0005,
      abovePrice: 0.005,
    }]);
    asserts.assertExists(
      DeribitInstrumentSchemaObject.safeParse({ kind: 'option' })[0],
    );
  });

  it('accepts a book summary with null bid/ask', () => {
    const [error, s] = DeribitBookSummarySchemaObject.safeParse({
      instrument_name: 'BTC-25DEC26-104000-C',
      creation_timestamp: 1794003606008,
      bid_price: null,
      ask_price: 0.0019,
      mark_price: 0.00174226,
      mark_iv: 43.09,
      open_interest: 183.1,
      volume: 0.3,
      volume_usd: 38.58,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals([s?.bidPrice, s?.markIv], [null, 43.09]);
  });

  it('keeps trade ids exact and stringifies numeric starbase fields', () => {
    const [error, t] = DeribitTradeSchemaObject.safeParse(RAW_TRADE);
    asserts.assertEquals(error, null);
    asserts.assertEquals(t?.starbaseTimestamp, '1794003632876548820');
    const [, safe] = DeribitTradeSchemaObject.safeParse({
      ...RAW_TRADE,
      starbase_match_id: 12,
    });
    asserts.assertEquals(safe?.starbaseMatchId, '12');
    asserts.assertExists(
      DeribitTradeSchemaObject.safeParse({ ...RAW_TRADE, direction: 'up' })[0],
    );
    const [, page] = DeribitTradesPageSchemaObject.safeParse({
      trades: [RAW_TRADE],
      has_more: true,
    });
    asserts.assertEquals(page?.hasMore, true);
    asserts.assertEquals(page?.trades[0]?.tradeSeq, 315282656);
  });

  it('reads an option ticker with greeks, IVs and stats', () => {
    const [error, t] = DeribitTickerSchemaObject.safeParse({
      timestamp: 1794003630326,
      state: 'open',
      stats: {
        high: 0.0115,
        low: 0.0012,
        price_change: -84.0,
        volume: 97.6,
        volume_usd: 34503.31,
      },
      greeks: {
        delta: 0.43263,
        gamma: 8.6e-4,
        vega: 9.91762,
        theta: -89.81552,
        rho: 0.36085,
      },
      index_price: 75926.87,
      instrument_name: 'BTC-7NOV26-76000-C',
      last_price: 0.0016,
      mark_price: 0.0019,
      best_ask_price: 0.0021,
      best_bid_price: 0.0017,
      mark_iv: 18.11,
      bid_iv: 16.44,
      ask_iv: 19.51,
      underlying_price: 75921.08,
      underlying_index: 'BTC-7NOV26',
      best_ask_amount: 1.6,
      best_bid_amount: 2.1,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(t?.greeks?.gamma, 8.6e-4);
    asserts.assertEquals(t?.stats?.volumeUsd, 34503.31);
    asserts.assertEquals([t?.markIv, t?.bidIv, t?.askIv], [
      18.11,
      16.44,
      19.51,
    ]);
  });

  it('turns book triples and snapshot pairs into level objects', () => {
    const [error, b] = DeribitBookUpdateSchemaObject.safeParse({
      type: 'change',
      timestamp: 1794003630805,
      prev_change_id: 181673602504,
      change_id: 181673602518,
      instrument_name: 'BTC-PERPETUAL',
      bids: [['delete', 75943.5, 0.0], ['new', 75945.0, 15810.0]],
      asks: [],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(b?.bids, [
      { action: 'delete', price: 75943.5, amount: 0 },
      { action: 'new', price: 75945, amount: 15810 },
    ]);
    asserts.assertExists(
      DeribitBookUpdateSchemaObject.safeParse({
        type: 'change',
        instrument_name: 'X',
        timestamp: 1,
        change_id: 2,
        bids: [['bogus', 1, 1]],
        asks: [],
      })[0],
    );
    const [, ob] = DeribitOrderBookSchemaObject.safeParse({
      timestamp: 1,
      state: 'open',
      change_id: 5,
      instrument_name: 'BTC-PERPETUAL',
      bids: [[75923.0, 128140.0]],
      asks: [],
      best_bid_price: 75923,
    });
    asserts.assertEquals(ob?.bids, [{ price: 75923, amount: 128140 }]);
    asserts.assertEquals(ob?.bestBidPrice, 75923);
  });

  it('validates mark prices, DVOL candles and the auth result', () => {
    asserts.assertEquals(
      DeribitMarkPriceSchemaObject.safeParse({
        timestamp: 1,
        iv: 0.3965,
        instrument_name: 'BTC-29JAN27-102000-C',
        mark_price: 0.0065,
      })[0],
      null,
    );
    asserts.assertEquals(
      DeribitVolatilityIndexDataSchemaObject.safeParse({
        data: [[1794000000000, 39.5, 39.51, 39.5, 39.5]],
        continuation: null,
      })[0],
      null,
    );
    asserts.assertExists(
      DeribitVolatilityIndexDataSchemaObject.safeParse({
        data: [[1, 2]],
        continuation: null,
      })[0],
    );
    const [, auth] = DeribitAuthResultSchemaObject.safeParse({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 900,
      scope: 'connection mainaccount read',
      token_type: 'bearer',
    });
    asserts.assertEquals([auth?.expiresIn, auth?.tokenType], [900, 'bearer']);
  });
});
