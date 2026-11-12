import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DataActivityPageSchemaObject,
  DataPositionSchemaObject,
  DataPositionsPageSchemaObject,
  DataResolutionListSchemaObject,
  DataTokenListSchemaObject,
  DataTradeSchemaObject,
  DataValueSchemaObject,
} from './DataApi.ts';

// Live-shaped /v2/positions row (2026-11-06).
const POSITION = {
  proxy_wallet: '0x87174492fdefc9a33bac36038a2c6692c255af52',
  token_id: '1097',
  condition_id: '0xf9e2',
  current_size: 4.7903,
  avg_price: 0.6199,
  entry_cost_usdc: 2.9699,
  entry_fees_usdc: 0.079,
  total_cost_usdc: 3.0489,
  current_price: 0,
  current_value: 0,
  total_size: 4.7903,
  realized_pnl: -0.079,
  unrealized_pnl: -2.9699,
  total_pnl: -3.0489,
  percent_pnl: -99.9967,
  percent_realized_pnl: -100,
  status: 'REDEEMABLE',
  redeemable: true,
  mergeable: false,
  negative_risk: false,
  archived: false,
  outcome: 'Up',
  outcome_index: 0,
  last_event_at: 1790649086,
  first_entry_at: 1790648328,
};

describe('DataApi schemas', () => {
  it('position: camelCases every key and keeps unmodelled ones', () => {
    const position = DataPositionSchemaObject.parse({
      ...POSITION,
      some_new_field: 1,
    });
    asserts.assertEquals(position.currentSize, 4.7903);
    asserts.assertEquals(position.totalCostUsdc, 3.0489);
    asserts.assertEquals(position.firstEntryAt, 1790648328);
    asserts.assertEquals(
      (position as unknown as { someNewField: number }).someNewField,
      1,
    );
  });

  it('position: missing economics or a non-boolean flag is rejected', () => {
    const { current_size: _size, ...noSize } = POSITION;
    asserts.assertExists(DataPositionSchemaObject.safeParse(noSize)[0]);
    asserts.assertExists(
      DataPositionSchemaObject.safeParse({ ...POSITION, redeemable: 'yes' })[0],
    );
  });

  it('pages require the pagination block and keep a null cursor', () => {
    const [error, page] = DataPositionsPageSchemaObject.safeParse({
      data: [POSITION],
      pagination: { limit: 1, offset: 0, has_more: false, next_cursor: null },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.pagination.nextCursor, null);
    asserts.assertExists(
      DataActivityPageSchemaObject.safeParse({ data: [] })[0],
    );
  });

  it('value unwraps data', () => {
    asserts.assertEquals(
      DataValueSchemaObject.parse({ data: { proxy_wallet: '0x1', value: 0 } }),
      { proxyWallet: '0x1', value: 0 },
    );
    asserts.assertExists(DataValueSchemaObject.safeParse({ data: null })[0]);
  });

  it('trade rows: enrichment fields are optional, economics are not', () => {
    const trade = {
      proxy_wallet: '0x1',
      condition_id: '0xc',
      token_id: '1',
      size: 1,
      price: 0.5,
      side: 'BUY',
      timestamp: 1,
      transaction_hash: '0xt',
      outcome: 'Up',
      outcome_index: 0,
    };
    asserts.assertEquals(DataTradeSchemaObject.safeParse(trade)[0], null);
    const { price: _price, ...noPrice } = trade;
    asserts.assertExists(DataTradeSchemaObject.safeParse(noPrice)[0]);
  });

  it('tokens and resolutions unwrap data and accept the vendor nulls', () => {
    const tokens = DataTokenListSchemaObject.parse({
      data: [{
        token_id: '1',
        condition_id: '0xc',
        structural_condition_id: null,
        module: 'v1_ctf',
        outcome_index: 1,
        clob_index: null,
        resolved: false,
        final_price: null,
        event_id: null,
      }],
    });
    asserts.assertEquals(tokens[0]!.finalPrice, null);
    const rows = DataResolutionListSchemaObject.parse({
      data: [{
        question_id: '0xq',
        condition_id: '0xc',
        status: 'posed',
        extended_review: false,
        was_disputed: false,
        new_version_q: true,
        proposed_price: '69',
        reproposed_price: '69',
        price: '69',
        transaction_hash: '0x99',
        log_index: '330',
        last_update_timestamp: '1794004182',
      }],
    });
    asserts.assertEquals(rows[0]!.proposedPrice, '69');
    asserts.assertEquals(rows[0]!.expectedSettlementTime, undefined);
    asserts.assertEquals(
      DataResolutionListSchemaObject.parse({ data: [] }),
      [],
    );
  });
});
