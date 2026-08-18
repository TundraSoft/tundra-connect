import * as asserts from '@asserts';
import { describe, it } from '@test';
import { IssueSchemaObject } from './Issue.ts';

const validIssue = {
  id: '1',
  shortId: 'PUMP-STATION-1',
  title: 'This is an example Python exception',
  culprit: 'raven.scripts.runner in main',
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
};

describe('Sentry.schema.Issue', () => {
  it('accepts a documented example issue', () => {
    asserts.assertEquals(IssueSchemaObject.safeParse(validIssue)[0], null);
  });

  it('accepts an issue with priority and substatus', () => {
    asserts.assertEquals(
      IssueSchemaObject.safeParse({
        ...validIssue,
        priority: 'high',
        substatus: 'ongoing',
        assignedTo: { type: 'user', id: '42' },
        tags: [{ key: 'browser', name: 'Browser', totalValues: 2 }],
      })[0],
      null,
    );
  });

  it('accepts a null priority', () => {
    asserts.assertEquals(
      IssueSchemaObject.safeParse({ ...validIssue, priority: null })[0],
      null,
    );
  });

  it('accepts vendor fields not modelled explicitly (passthrough)', () => {
    asserts.assertEquals(
      IssueSchemaObject.safeParse({ ...validIssue, isUnhandled: true })[0],
      null,
    );
  });

  it('coerces a numeric count to a string (Guardian.string() coerces by default)', () => {
    const [err, issue] = IssueSchemaObject.safeParse({
      ...validIssue,
      count: 1,
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(issue?.count, '1');
  });

  it('rejects a count that cannot be coerced to a string', () => {
    asserts.assertExists(
      IssueSchemaObject.safeParse({ ...validIssue, count: {} })[0],
    );
  });

  it('rejects an issue with an undocumented priority', () => {
    asserts.assertExists(
      IssueSchemaObject.safeParse({ ...validIssue, priority: 'urgent' })[0],
    );
  });

  it('rejects an issue missing the required project', () => {
    const { project: _project, ...withoutProject } = validIssue;
    asserts.assertExists(IssueSchemaObject.safeParse(withoutProject)[0]);
  });

  it('rejects an issue with a malformed project reference', () => {
    asserts.assertExists(
      IssueSchemaObject.safeParse({ ...validIssue, project: { id: '2' } })[0],
    );
  });
});
