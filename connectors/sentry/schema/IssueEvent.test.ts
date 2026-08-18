import * as asserts from '@asserts';
import { describe, it } from '@test';
import { IssueEventSchemaObject } from './IssueEvent.ts';

describe('Sentry.schema.IssueEvent', () => {
  it('accepts a minimal event', () => {
    asserts.assertEquals(
      IssueEventSchemaObject.safeParse({
        id: 'abc123',
        dateCreated: '2018-11-06T21:19:55Z',
      })[0],
      null,
    );
  });

  it('accepts a fully-populated event', () => {
    const [err] = IssueEventSchemaObject.safeParse({
      id: 'abc123',
      eventID: 'abc123',
      groupID: '1',
      projectID: '2',
      title: 'Example exception',
      message: 'Something went wrong',
      platform: 'python',
      dateCreated: '2018-11-06T21:19:55Z',
      culprit: 'raven.scripts.runner in main',
      tags: [{ key: 'browser', value: 'Chrome' }],
      user: { id: '42', email: 'user@example.com' },
    });
    asserts.assertEquals(err, null);
  });

  it('accepts vendor fields not modelled explicitly (passthrough)', () => {
    asserts.assertEquals(
      IssueEventSchemaObject.safeParse({
        id: 'abc123',
        dateCreated: '2018-11-06T21:19:55Z',
        metadata: { type: 'ValueError' },
      })[0],
      null,
    );
  });

  it('rejects an event missing the required id', () => {
    asserts.assertExists(
      IssueEventSchemaObject.safeParse({
        dateCreated: '2018-11-06T21:19:55Z',
      })[0],
    );
  });

  it('rejects an event missing the required dateCreated', () => {
    asserts.assertExists(
      IssueEventSchemaObject.safeParse({ id: 'abc123' })[0],
    );
  });
});
