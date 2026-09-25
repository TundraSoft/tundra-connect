import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ListIssuesRequestSchemaObject,
  ListIssuesResponseSchemaObject,
} from './ListIssues.ts';

describe('Sentry.schema.ListIssuesRequest', () => {
  it('accepts an empty filter (all fields optional)', () => {
    asserts.assertEquals(ListIssuesRequestSchemaObject.safeParse({})[0], null);
  });

  it('accepts documented filter/pagination fields, including repeated project', () => {
    asserts.assertEquals(
      ListIssuesRequestSchemaObject.safeParse({
        project: ['1234', '5678'],
        query: 'is:unresolved',
        environment: ['production'],
        statsPeriod: '24h',
        sort: 'freq',
        cursor: '0:100:0',
        limit: 50,
      })[0],
      null,
    );
  });

  it('rejects an undocumented sort value', () => {
    asserts.assertExists(
      ListIssuesRequestSchemaObject.safeParse({ sort: 'bogus' })[0],
    );
  });

  it('rejects a limit over 100', () => {
    asserts.assertExists(
      ListIssuesRequestSchemaObject.safeParse({ limit: 101 })[0],
    );
  });

  it('rejects an empty project entry', () => {
    asserts.assertExists(
      ListIssuesRequestSchemaObject.safeParse({ project: [''] })[0],
    );
  });
});

describe('Sentry.schema.ListIssuesResponse', () => {
  it('accepts an empty page', () => {
    asserts.assertEquals(
      ListIssuesResponseSchemaObject.safeParse({ issues: [] })[0],
      null,
    );
  });

  it('accepts a page with issues and a nextCursor', () => {
    const [err, page] = ListIssuesResponseSchemaObject.safeParse({
      issues: [
        {
          id: '1',
          shortId: 'PUMP-STATION-1',
          title: 'Example exception',
          level: 'error',
          status: 'unresolved',
          isPublic: false,
          type: 'default',
          numComments: 0,
          isBookmarked: false,
          count: '1',
          userCount: 0,
          firstSeen: '2018-11-06T21:19:55Z',
          lastSeen: '2018-11-06T21:19:55Z',
          project: { id: '2', name: 'Pump Station', slug: 'pump-station' },
        },
      ],
      nextCursor: '0:100:0',
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(page?.issues.length, 1);
    asserts.assertEquals(page?.nextCursor, '0:100:0');
  });

  it('leaves nextCursor undefined when absent', () => {
    const [err, page] = ListIssuesResponseSchemaObject.safeParse({
      issues: [],
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(page?.nextCursor, undefined);
  });

  it('rejects a page missing the required issues array', () => {
    asserts.assertExists(ListIssuesResponseSchemaObject.safeParse({})[0]);
  });
});
