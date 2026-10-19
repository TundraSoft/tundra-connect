import { describe, it } from '@test';
import { assert, assertEquals } from '@asserts';
import {
  PythPriceFeedUpdateSchemaObject,
  PythStreamUpdateSchemaObject,
  PythSubscribedSchemaObject,
} from './StreamUpdate.ts';

describe('Pyth Pro schemas', () => {
  it('keeps i64 mantissas exact and turns timestampUs into a number', () => {
    const [error, update] = PythStreamUpdateSchemaObject.safeParse({
      type: 'streamUpdated',
      subscriptionId: 1,
      parsed: {
        timestampUs: '1730986152400000',
        priceFeeds: [{
          priceFeedId: 1,
          price: '9223372036854775807',
          bestBidPrice: 1006900000000,
          exponent: -8,
          marketSession: 'regular',
          somethingNew: true,
        }],
      },
      solana: { encoding: 'hex', data: 'b901' },
    });
    assertEquals(error, null);
    assertEquals(update?.parsed?.timestampUs, 1730986152400000);
    const feed = update!.parsed!.priceFeeds[0]!;
    assertEquals(feed.price, '9223372036854775807');
    assertEquals(feed.bestBidPrice, '1006900000000');
    assertEquals((feed as Record<string, unknown>).somethingNew, true);
    assertEquals(update?.solana?.data, 'b901');
  });

  it('rejects a malformed mantissa or timestamp', () => {
    assert(
      PythPriceFeedUpdateSchemaObject.safeParse({
        priceFeedId: 1,
        price: '1.5',
      })[0],
    );
    assert(
      PythStreamUpdateSchemaObject.safeParse({
        type: 'streamUpdated',
        subscriptionId: 1,
        parsed: { timestampUs: 'soon', priceFeeds: [] },
      })[0],
    );
  });

  it('parses both subscription acknowledgements', () => {
    assertEquals(
      PythSubscribedSchemaObject.safeParse({
        type: 'subscribed',
        subscriptionId: 3,
      })[0],
      null,
    );
    const [error, ack] = PythSubscribedSchemaObject.safeParse({
      type: 'subscribedWithInvalidFeedIdsIgnored',
      subscriptionId: 3,
      subscribedFeedIds: [1],
      ignoredInvalidFeedIds: {
        unknownIds: [9],
        unknownSymbols: ['Nope'],
        unsupportedChannels: [],
        unstable: [],
      },
    });
    assertEquals(error, null);
    assertEquals(ack?.ignoredInvalidFeedIds?.unknownSymbols, ['Nope']);
  });
});
