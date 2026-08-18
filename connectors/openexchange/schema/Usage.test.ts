import * as asserts from '@asserts';
import { describe, it } from '@test';
import { UsageResponseSchemaObject } from './Usage.ts';

const statusResponse = {
  status: 200,
  data: {
    app_id: 'test_app_id',
    status: 'ACTIVE',
    plan: {
      name: 'Free',
      quota: '1,000 requests/month',
      update_frequency: '60 minutes',
      features: {
        base: true,
        symbols: false,
        experimental: false,
        'time-series': false,
        convert: false,
        'bid-ask': false,
        ohlc: false,
        spot: false,
      },
    },
    usage: {
      requests: 42,
      requests_quota: 1000,
      requests_remaining: 958,
      days_elapsed: 15,
      days_remaining: 15,
      daily_average: 2.8,
    },
  },
};

describe('OpenExchange.schema.Usage', () => {
  it('accepts status and usage responses', () => {
    asserts.assertEquals(
      UsageResponseSchemaObject.safeParse(statusResponse)[0],
      null,
    );
  });

  it('rejects invalid status values', () => {
    asserts.assertExists(
      UsageResponseSchemaObject.safeParse({
        ...statusResponse,
        data: { ...statusResponse.data, status: 'PENDING' },
      })[0],
    );
  });
});
