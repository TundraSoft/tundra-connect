import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DataPositionListSchemaObject,
  DataPositionSchemaObject,
  DataValueListSchemaObject,
} from './DataApi.ts';

const POSITION = {
  proxyWallet: '0x5268527977f700f9bf9b6d5cd843859e4e70135d',
  asset: '9595',
  conditionId: '0x8a9d',
  size: 131432.468,
  avgPrice: 0.4697,
  initialValue: 61742.0657,
  grossInitialValue: 63039.217498,
  entryFeesUsdc: 1297.15177,
  currentValue: 0,
  cashPnl: -61742.0657,
  percentPnl: -99.9999,
  totalBought: 131432.468,
  realizedPnl: -1297.1517,
  percentRealizedPnl: -100,
  curPrice: 0,
  redeemable: true,
  mergeable: false,
  title: 'Orioles vs. Rockies: O/U 11.5',
  slug: 'mlb-bal-col-2026-09-02-total-11pt5',
  icon: 'https://example/x.jpg',
  eventId: '920959',
  eventSlug: 'mlb-bal-col-2026-09-02',
  outcome: 'Over',
  outcomeIndex: 0,
  oppositeOutcome: 'Under',
  oppositeAsset: '9920',
  endDate: '2026-09-02',
  negativeRisk: false,
};

describe('DataApi schemas', () => {
  it('validates a live-shaped position and passes unmodeled fields through', () => {
    const position = DataPositionSchemaObject.parse(POSITION);
    asserts.assertEquals(position.size, 131432.468);
    asserts.assertEquals(position.redeemable, true);
    asserts.assertEquals(position.oppositeOutcome, 'Under');
    asserts.assertEquals(
      (position as unknown as { grossInitialValue: number }).grossInitialValue,
      63039.217498,
    );
  });

  it('rejects a position missing its core numeric fields', () => {
    const { size: _size, ...noSize } = POSITION;
    asserts.assertExists(DataPositionSchemaObject.safeParse(noSize)[0]);
    // Guardian coerces primitive strings ('yes' -> true); only a non-primitive is rejected.
    asserts.assertExists(
      DataPositionSchemaObject.safeParse({ ...POSITION, redeemable: {} })[0],
    );
  });

  it('normalizes a null list to [] and validates each row', () => {
    asserts.assertEquals(DataPositionListSchemaObject.parse(null), []);
    asserts.assertEquals(DataPositionListSchemaObject.parse([]), []);
    asserts.assertEquals(
      DataPositionListSchemaObject.parse([POSITION]).length,
      1,
    );
    asserts.assertExists(DataPositionListSchemaObject.safeParse([{}])[0]);
  });

  it('parses the value list', () => {
    const values = DataValueListSchemaObject.parse([{
      user: '0x5268',
      value: 122392.0752,
    }]);
    asserts.assertEquals(values[0]!.value, 122392.0752);
    asserts.assertEquals(DataValueListSchemaObject.parse(null), []);
    asserts.assertExists(
      DataValueListSchemaObject.safeParse([{ user: '0x', value: 'lots' }])[0],
    );
  });
});
