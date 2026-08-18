import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ProjectSchemaObject } from './Project.ts';

describe('Sentry.schema.Project', () => {
  it('accepts a minimal project', () => {
    asserts.assertEquals(
      ProjectSchemaObject.safeParse({
        id: '2',
        slug: 'pump-station',
        name: 'Pump Station',
        dateCreated: '2018-11-06T21:19:55Z',
      })[0],
      null,
    );
  });

  it('accepts a fully-populated project', () => {
    const [err] = ProjectSchemaObject.safeParse({
      id: '2',
      slug: 'pump-station',
      name: 'Pump Station',
      platform: 'python',
      platforms: ['python'],
      dateCreated: '2018-11-06T21:19:55Z',
      isBookmarked: false,
      isMember: true,
      features: ['releases'],
      firstEvent: '2018-11-06T21:19:55Z',
      // Vendor fields not modelled explicitly, allowed via .passthrough().
      hasAccess: true,
      teams: [{ id: '1', name: 'Ops', slug: 'ops' }],
    });
    asserts.assertEquals(err, null);
  });

  it('accepts a null firstEvent', () => {
    asserts.assertEquals(
      ProjectSchemaObject.safeParse({
        id: '2',
        slug: 'pump-station',
        name: 'Pump Station',
        dateCreated: '2018-11-06T21:19:55Z',
        firstEvent: null,
      })[0],
      null,
    );
  });

  it('rejects a project missing the required slug', () => {
    asserts.assertExists(
      ProjectSchemaObject.safeParse({
        id: '2',
        name: 'Pump Station',
        dateCreated: '2018-11-06T21:19:55Z',
      })[0],
    );
  });
});
