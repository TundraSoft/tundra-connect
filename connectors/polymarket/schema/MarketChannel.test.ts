import { describe, it } from '@test';
import { assert, assertEquals } from '@asserts';
import {
  PolymarketBestBidAskSchemaObject,
  PolymarketBookSchemaObject,
  PolymarketLastTradePriceSchemaObject,
  PolymarketMarketResolvedSchemaObject,
  PolymarketNewMarketSchemaObject,
  PolymarketPriceChangeSchemaObject,
  PolymarketTickSizeChangeSchemaObject,
} from './MarketChannel.ts';

const ts = '1782753357257';

describe('MarketChannel schemas', () => {
  it('book: coerces levels and timestamp, keeps extra fields', () => {
    const [error, book] = PolymarketBookSchemaObject.safeParse({
      event_type: 'book',
      market: '0xm',
      asset_id: '1',
      timestamp: ts,
      hash: 'h',
      bids: [{ price: '0.08', size: '33343.4' }],
      asks: [],
      tick_size: '0.01',
      brand_new_field: 'kept',
    });
    assertEquals(error, null);
    assertEquals(book?.bids, [{ price: 0.08, size: 33343.4 }]);
    assertEquals(book?.timestamp, 1782753357257);
    assertEquals(book?.tickSize, 0.01);
    assertEquals((book as Record<string, unknown>).brandNewField, 'kept');
  });

  it('book: rejects a non-numeric level', () => {
    const [error] = PolymarketBookSchemaObject.safeParse({
      event_type: 'book',
      market: '0xm',
      asset_id: '1',
      timestamp: ts,
      hash: 'h',
      bids: [{ price: 'x', size: '1' }],
      asks: [],
    });
    assert(error);
  });

  it('price_change: accepts `changes` as an alias', () => {
    const [error, change] = PolymarketPriceChangeSchemaObject.safeParse({
      event_type: 'price_change',
      market: '0xm',
      timestamp: ts,
      changes: [{
        asset_id: '1',
        price: '0.3',
        size: '0',
        side: 'SELL',
        hash: 'h',
      }],
    });
    assertEquals(error, null);
    assertEquals(change?.priceChanges[0]?.size, 0);
    assertEquals(change?.priceChanges[0]?.side, 'SELL');
  });

  it('price_change: rejects an unknown side', () => {
    const [error] = PolymarketPriceChangeSchemaObject.safeParse({
      event_type: 'price_change',
      market: '0xm',
      timestamp: ts,
      price_changes: [{
        asset_id: '1',
        price: '0.3',
        size: '1',
        side: 'HOLD',
        hash: 'h',
      }],
    });
    assert(error);
  });

  it('tick_size_change, last_trade_price, best_bid_ask', () => {
    assertEquals(
      PolymarketTickSizeChangeSchemaObject.safeParse({
        event_type: 'tick_size_change',
        market: '0xm',
        asset_id: '1',
        old_tick_size: '0.01',
        new_tick_size: '0.001',
        timestamp: ts,
      })[1]?.newTickSize,
      0.001,
    );
    const [, trade] = PolymarketLastTradePriceSchemaObject.safeParse({
      event_type: 'last_trade_price',
      market: '0xm',
      asset_id: '1',
      price: '0.08',
      size: '219.217767',
      fee_rate_bps: '0',
      side: 'SELL',
      timestamp: ts,
      transaction_hash: '0xeee',
    });
    assertEquals([trade?.price, trade?.size, trade?.transactionHash], [
      0.08,
      219.217767,
      '0xeee',
    ]);
    const [, top] = PolymarketBestBidAskSchemaObject.safeParse({
      event_type: 'best_bid_ask',
      market: '0xm',
      asset_id: '1',
      best_bid: '0.08',
      best_ask: '0.09',
      spread: '0.01',
      timestamp: ts,
    });
    assertEquals(top?.spread, 0.01);
  });

  it('new_market and market_resolved', () => {
    const [e1, listed] = PolymarketNewMarketSchemaObject.safeParse({
      event_type: 'new_market',
      id: '1',
      question: 'Q?',
      market: '0xm',
      slug: 'q',
      assets_ids: ['1', '2'],
      outcomes: ['Yes', 'No'],
      timestamp: ts,
      clob_token_ids: ['1', '2'],
    });
    assertEquals(e1, null);
    assertEquals((listed as Record<string, unknown>).clobTokenIds, ['1', '2']);
    const [e2, resolved] = PolymarketMarketResolvedSchemaObject.safeParse({
      event_type: 'market_resolved',
      id: '1',
      market: '0xm',
      assets_ids: ['1', '2'],
      winning_asset_id: '1',
      winning_outcome: 'Yes',
      timestamp: ts,
    });
    assertEquals(e2, null);
    assertEquals(resolved?.winningOutcome, 'Yes');
  });

  it('rejects the wrong event_type', () => {
    const [error] = PolymarketBestBidAskSchemaObject.safeParse({
      event_type: 'book',
      market: '0xm',
      asset_id: '1',
      best_bid: '0.08',
      best_ask: '0.09',
      spread: '0.01',
      timestamp: ts,
    });
    assert(error);
  });
});
