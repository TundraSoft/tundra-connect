import * as asserts from '@asserts';
import { describe, it } from '@test';
import { IssueProjectRefSchemaObject } from './Common.ts';

describe('Sentry.schema.IssueProjectRef', () => {
  it('accepts a minimal project reference', () => {
    asserts.assertEquals(
      IssueProjectRefSchemaObject.safeParse({
        id: '2',
        name: 'Pump Station',
        slug: 'pump-station',
      })[0],
      null,
    );
  });

  it('accepts a project reference with platform', () => {
    asserts.assertEquals(
      IssueProjectRefSchemaObject.safeParse({
        id: '2',
        name: 'Pump Station',
        slug: 'pump-station',
        platform: 'python',
      })[0],
      null,
    );
  });

  it('accepts a null platform', () => {
    asserts.assertEquals(
      IssueProjectRefSchemaObject.safeParse({
        id: '2',
        name: 'Pump Station',
        slug: 'pump-station',
        platform: null,
      })[0],
      null,
    );
  });

  it('rejects a reference missing the required slug', () => {
    asserts.assertExists(
      IssueProjectRefSchemaObject.safeParse({
        id: '2',
        name: 'Pump Station',
      })[0],
    );
  });
});
