import * as asserts from '@asserts';
import { describe, it } from '@test';
import { UpdateIssueRequestSchemaObject } from './UpdateIssue.ts';

describe('Sentry.schema.UpdateIssueRequest', () => {
  it('accepts a status-only update', () => {
    asserts.assertEquals(
      UpdateIssueRequestSchemaObject.safeParse({ status: 'resolved' })[0],
      null,
    );
  });

  it('accepts a fully-populated update', () => {
    const [err] = UpdateIssueRequestSchemaObject.safeParse({
      status: 'ignored',
      substatus: 'archived_forever',
      statusDetails: { ignoreDuration: 30 },
      priority: 'high',
      assignedTo: 'user:42',
      inbox: false,
      hasSeen: true,
      isBookmarked: true,
      isSubscribed: true,
      isPublic: false,
      merge: false,
      discard: false,
    });
    asserts.assertEquals(err, null);
  });

  it('accepts a single boolean-only update', () => {
    asserts.assertEquals(
      UpdateIssueRequestSchemaObject.safeParse({ isBookmarked: true })[0],
      null,
    );
  });

  it('rejects an empty update (no fields supplied)', () => {
    asserts.assertExists(UpdateIssueRequestSchemaObject.safeParse({})[0]);
  });

  it('rejects an undocumented status value', () => {
    asserts.assertExists(
      UpdateIssueRequestSchemaObject.safeParse({ status: 'closed' })[0],
    );
  });

  it('rejects an undocumented priority value', () => {
    asserts.assertExists(
      UpdateIssueRequestSchemaObject.safeParse({ priority: 'urgent' })[0],
    );
  });

  it('rejects a blank assignedTo', () => {
    asserts.assertExists(
      UpdateIssueRequestSchemaObject.safeParse({ assignedTo: '' })[0],
    );
  });
});
