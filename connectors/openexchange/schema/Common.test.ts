import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  baseGuard,
  disclaimerGuard,
  RateSchemaObject,
  timestampGuard,
} from './Common.ts';

describe('OpenExchange.schema.Common', () => {
  it('validates documented common values', () => {
    asserts.assertEquals(
      disclaimerGuard.safeParse('Valid disclaimer')[0],
      null,
    );
    asserts.assertEquals(timestampGuard.safeParse(1703971200)[0], null);
    asserts.assertEquals(baseGuard.safeParse('USD')[0], null);
    asserts.assertEquals(
      RateSchemaObject.safeParse({ USD: 1, EUR: 0.9023 })[0],
      null,
    );
  });

  it('rejects invalid common values', () => {
    asserts.assertExists(disclaimerGuard.safeParse('Hi')[0]);
    asserts.assertExists(timestampGuard.safeParse(-1)[0]);
    asserts.assertExists(baseGuard.safeParse('US')[0]);
    asserts.assertExists(RateSchemaObject.safeParse({ US: -1 })[0]);
  });
});
