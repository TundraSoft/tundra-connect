import { describe, it } from '@test';
import { assertEquals } from '@asserts';
import { camelizeKeys } from './camelizeKeys.ts';

describe('camelizeKeys', () => {
  it('converts keys deeply and leaves values alone', () => {
    assertEquals(
      camelizeKeys({
        event_type: 'book',
        price_changes: [{ best_bid: '0.1', asset_id: 'x' }],
        nested: { full_accuracy_value: '1' },
        already: 1,
      }),
      {
        eventType: 'book',
        priceChanges: [{ bestBid: '0.1', assetId: 'x' }],
        nested: { fullAccuracyValue: '1' },
        already: 1,
      },
    );
  });

  it('passes primitives and null through', () => {
    assertEquals(camelizeKeys(null), null);
    assertEquals(camelizeKeys('a_b'), 'a_b');
    assertEquals(camelizeKeys([1, 'x']), [1, 'x']);
  });
});
