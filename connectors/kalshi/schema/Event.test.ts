import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  EventSchemaObject,
  EventsPageSchemaObject,
  SingleEventSchemaObject,
} from './Event.ts';

describe('Event schema', () => {
  it('parses an event', () => {
    const event = EventSchemaObject.parse({
      event_ticker: 'KXBTCD-26JUL1515',
      series_ticker: 'KXBTCD',
      title: 'Bitcoin price on Jul 15, 2026?',
      mutually_exclusive: true,
    });
    asserts.assertEquals(event.eventTicker, 'KXBTCD-26JUL1515');
    asserts.assertEquals(event.mutuallyExclusive, true);
  });

  it('parses nested markets when with_nested_markets was requested', () => {
    const event = EventSchemaObject.parse({
      event_ticker: 'E',
      title: 'T',
      markets: [{ ticker: 'M1', event_ticker: 'E', status: 'active' }],
    });
    asserts.assertEquals(event.markets?.length, 1);
    asserts.assertEquals(event.markets?.[0]?.ticker, 'M1');
  });

  it('parses a page and unwraps a single event envelope', () => {
    const page = EventsPageSchemaObject.parse({
      events: [{ event_ticker: 'E', title: 'T' }],
      cursor: 'c1',
    });
    asserts.assertEquals(page.events.length, 1);
    const single = SingleEventSchemaObject.parse({
      event: { event_ticker: 'E', title: 'T' },
    });
    asserts.assertEquals(single.eventTicker, 'E');
  });

  it('rejects an event missing the required title', () => {
    asserts.assertThrows(() => EventSchemaObject.parse({ event_ticker: 'E' }));
  });
});
