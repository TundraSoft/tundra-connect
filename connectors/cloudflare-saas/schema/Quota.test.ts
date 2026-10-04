import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CustomHostnameQuotaSchemaObject } from './Quota.ts';

describe('CloudflareSaaS.schema.Quota', () => {
  it('accepts a full quota', () => {
    const [error, quota] = CustomHostnameQuotaSchemaObject.safeParse({
      allocated: 100,
      used: 12,
      hard_cap: 100,
      exceeded: false,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(quota?.used, 12);
  });

  it('rejects a coerced exceeded flag', () => {
    asserts.assertExists(
      CustomHostnameQuotaSchemaObject.safeParse({
        allocated: 1,
        used: 0,
        exceeded: 'no',
      })[0],
    );
  });
});
