import * as asserts from '$asserts';
import {
  StatusSchemaObject,
  UsageResponseSchemaObject,
  UsageSchemaObject,
} from './Usage.ts';

Deno.test('OpenExchange.schema.Usage', async (t) => {
  await t.step('process valid usage response correctly', () => {
    asserts.assert(UsageResponseSchemaObject({
      status: 200,
      data: {
        app_id: 'test_app_id_123',
        status: 'ACTIVE',
        plan: {
          name: 'Enterprise',
          quota: '100,000 requests/month',
          update_frequency: '60s',
          features: {
            base: true,
            symbols: true,
            experimental: true,
            'time-series': true,
            convert: true,
            'bid-ask': true,
            ohlc: true,
            spot: true,
          },
        },
      },
      usage: {
        requests: 12345,
        requests_quota: 100000,
        requests_remaining: 87655,
        days_elapsed: 15,
        days_remaining: 15,
        daily_average: 823,
      },
    }));

    asserts.assert(UsageResponseSchemaObject({
      status: 200,
      data: {
        app_id: 'free_plan_app',
        status: 'INACTIVE',
        plan: {
          name: 'Free',
          quota: '1,000 requests/month',
          update_frequency: '3600s',
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
      },
      usage: {
        requests: 0,
        requests_quota: 1000,
        requests_remaining: 1000,
        days_elapsed: 0,
        days_remaining: 30,
        daily_average: 0,
      },
    }));
  });

  await t.step('process valid status object correctly', () => {
    asserts.assert(StatusSchemaObject({
      app_id: 'test_app_id',
      status: 'ACTIVE',
      plan: {
        name: 'Professional',
        quota: '10,000 requests/month',
        update_frequency: '300s',
        features: {
          base: true,
          symbols: true,
          experimental: false,
          'time-series': true,
          convert: true,
          'bid-ask': false,
          ohlc: true,
          spot: true,
        },
      },
    }));
  });

  await t.step('process valid usage object correctly', () => {
    asserts.assert(UsageSchemaObject({
      requests: 5000,
      requests_quota: 10000,
      requests_remaining: 5000,
      days_elapsed: 10,
      days_remaining: 20,
      daily_average: 500,
    }));
  });

  await t.step('invalid usage response schema', () => {
    // Invalid status (not a number)
    asserts.assertThrows(() =>
      UsageResponseSchemaObject({
        status: 'ok',
        data: {
          app_id: 'test_app_id',
          status: 'ACTIVE',
          plan: {
            name: 'Free',
            quota: '1,000 requests/month',
            update_frequency: '3600s',
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
        },
        usage: {
          requests: 100,
          requests_quota: 1000,
          requests_remaining: 900,
          days_elapsed: 5,
          days_remaining: 25,
          daily_average: 20,
        },
      })
    );

    // Invalid status value (not ACTIVE or INACTIVE)
    asserts.assertThrows(() =>
      UsageResponseSchemaObject({
        status: 200,
        data: {
          app_id: 'test_app_id',
          status: 'PENDING',
          plan: {
            name: 'Free',
            quota: '1,000 requests/month',
            update_frequency: '3600s',
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
        },
        usage: {
          requests: 100,
          requests_quota: 1000,
          requests_remaining: 900,
          days_elapsed: 5,
          days_remaining: 25,
          daily_average: 20,
        },
      })
    );

    // Invalid usage (negative values)
    asserts.assertThrows(() =>
      UsageResponseSchemaObject({
        status: 200,
        data: {
          app_id: 'test_app_id',
          status: 'ACTIVE',
          plan: {
            name: 'Free',
            quota: '1,000 requests/month',
            update_frequency: '3600s',
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
        },
        usage: {
          requests: -100,
          requests_quota: 1000,
          requests_remaining: 900,
          days_elapsed: 5,
          days_remaining: 25,
          daily_average: 20,
        },
      })
    );

    // Missing required fields
    asserts.assertThrows(() =>
      UsageResponseSchemaObject({
        status: 200,
        data: {
          app_id: 'test_app_id',
          status: 'ACTIVE',
          plan: {
            name: 'Free',
            quota: '1,000 requests/month',
            update_frequency: '3600s',
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
        },
        usage: {
          requests: 100,
          requests_quota: 1000,
          // missing requests_remaining
          days_elapsed: 5,
          days_remaining: 25,
          daily_average: 20,
        },
      })
    );
  });
});
