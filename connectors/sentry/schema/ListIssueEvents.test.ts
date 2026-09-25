import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ListIssueEventsRequestSchemaObject,
  ListIssueEventsResponseSchemaObject,
} from './ListIssueEvents.ts';

describe('Sentry.schema.ListIssueEventsRequest', () => {
  it('accepts an empty filter (all fields optional)', () => {
    asserts.assertEquals(
      ListIssueEventsRequestSchemaObject.safeParse({})[0],
      null,
    );
  });

  it('accepts documented filter/pagination fields', () => {
    asserts.assertEquals(
      ListIssueEventsRequestSchemaObject.safeParse({
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-31T00:00:00Z',
        statsPeriod: '14d',
        environment: 'production',
        full: true,
        query: 'browser:Chrome',
        perPage: 50,
        cursor: '0:100:0',
      })[0],
      null,
    );
  });

  it('rejects a perPage over 100', () => {
    asserts.assertExists(
      ListIssueEventsRequestSchemaObject.safeParse({ perPage: 101 })[0],
    );
  });
});

describe('Sentry.schema.ListIssueEventsResponse', () => {
  it('accepts an empty page', () => {
    asserts.assertEquals(
      ListIssueEventsResponseSchemaObject.safeParse({ events: [] })[0],
      null,
    );
  });

  it('accepts a page with events and a nextCursor', () => {
    const [err, page] = ListIssueEventsResponseSchemaObject.safeParse({
      events: [{ id: 'abc123', dateCreated: '2018-11-06T21:19:55Z' }],
      nextCursor: '0:100:0',
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(page?.events.length, 1);
    asserts.assertEquals(page?.nextCursor, '0:100:0');
  });

  it('leaves nextCursor undefined when absent', () => {
    const [err, page] = ListIssueEventsResponseSchemaObject.safeParse({
      events: [],
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(page?.nextCursor, undefined);
  });

  it('rejects a page missing the required events array', () => {
    asserts.assertExists(ListIssueEventsResponseSchemaObject.safeParse({})[0]);
  });
});
