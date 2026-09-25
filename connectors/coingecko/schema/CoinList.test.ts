import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CoinListEntrySchemaObject, CoinListSchemaObject } from './CoinList.ts';

describe('CoinGecko.schema.CoinList', () => {
  it('accepts a minimal coin list entry', () => {
    const [error, coin] = CoinListEntrySchemaObject.safeParse({
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(coin?.id, 'bitcoin');
  });

  it('accepts a coin list entry with platforms', () => {
    const [error, coin] = CoinListEntrySchemaObject.safeParse({
      id: 'usd-coin',
      symbol: 'usdc',
      name: 'USD Coin',
      platforms: { ethereum: '0xa0b8...', solana: 'EPjF...' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(coin?.platforms?.ethereum, '0xa0b8...');
  });

  it('rejects an entry missing required fields', () => {
    asserts.assertExists(
      CoinListEntrySchemaObject.safeParse({
        symbol: 'btc',
        name: 'Bitcoin',
      })[0],
    );
  });

  it('validates a full coin list array', () => {
    const [error, coins] = CoinListSchemaObject.safeParse([
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
      { id: 'ethereum', symbol: 'eth', name: 'Ethereum' },
    ]);
    asserts.assertEquals(error, null);
    asserts.assertEquals(coins?.length, 2);
  });

  it('rejects a non-array payload', () => {
    asserts.assertExists(
      CoinListSchemaObject.safeParse({ id: 'bitcoin' })[0],
    );
  });

  it('rejects an array containing an invalid entry', () => {
    asserts.assertExists(
      CoinListSchemaObject.safeParse([
        { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
        { symbol: 'eth', name: 'Ethereum' },
      ])[0],
    );
  });
});
