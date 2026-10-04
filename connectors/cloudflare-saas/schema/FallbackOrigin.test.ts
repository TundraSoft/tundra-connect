import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  FALLBACK_ORIGIN_STATUSES,
  FallbackOriginSchemaObject,
} from './FallbackOrigin.ts';

describe('CloudflareSaaS.schema.FallbackOrigin', () => {
  it('accepts a full and an empty fallback origin', () => {
    const [error, origin] = FallbackOriginSchemaObject.safeParse({
      origin: 'fallback.yourapp.com',
      status: 'active',
      errors: [],
      created_at: '2026-10-04T12:00:00.000Z',
      updated_at: '2026-10-04T12:00:00.000Z',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(origin?.status, 'active');
    asserts.assertEquals(FallbackOriginSchemaObject.safeParse({})[0], null);
  });

  it('rejects a non-array errors field', () => {
    asserts.assertExists(
      FallbackOriginSchemaObject.safeParse({ errors: 'none' })[0],
    );
  });

  it('documents the status list', () => {
    asserts.assert(FALLBACK_ORIGIN_STATUSES.includes('pending_deployment'));
    asserts.assertEquals(FALLBACK_ORIGIN_STATUSES.length, 6);
  });
});
