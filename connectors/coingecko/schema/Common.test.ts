import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  coinIdGuard,
  coinNameGuard,
  coinSymbolGuard,
  RoiSchemaObject,
} from './Common.ts';

describe('CoinGecko.schema.Common', () => {
  it('validates documented common values', () => {
    asserts.assertEquals(coinIdGuard.safeParse('bitcoin')[0], null);
    asserts.assertEquals(coinSymbolGuard.safeParse('btc')[0], null);
    asserts.assertEquals(coinNameGuard.safeParse('Bitcoin')[0], null);
    asserts.assertEquals(
      RoiSchemaObject.safeParse({
        times: 96.4,
        currency: 'usd',
        percentage: 9640.5,
      })[0],
      null,
    );
  });

  it('rejects invalid common values', () => {
    asserts.assertExists(coinIdGuard.safeParse('')[0]);
    asserts.assertExists(coinSymbolGuard.safeParse('')[0]);
    asserts.assertExists(coinNameGuard.safeParse('')[0]);
    asserts.assertExists(
      RoiSchemaObject.safeParse({ times: 'a lot', currency: 'usd' })[0],
    );
  });
});
