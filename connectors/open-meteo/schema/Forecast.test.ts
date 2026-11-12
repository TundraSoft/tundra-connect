import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  OpenMeteoErrorBodySchemaObject,
  OpenMeteoForecastSchemaObject,
  OpenMeteoSeriesBlockSchemaObject,
} from './mod.ts';

const base = {
  latitude: 40.78,
  longitude: -73.96,
  utc_offset_seconds: -18000,
  timezone: 'America/New_York',
  timezone_abbreviation: 'GMT-5',
};

describe('OpenMeteo.schema.Forecast', () => {
  it('accepts every block and keeps unmodelled fields', () => {
    const [error, value] = OpenMeteoForecastSchemaObject.safeParse({
      ...base,
      generationtime_ms: 0.1,
      elevation: 40,
      current_units: { time: 'iso8601', interval: 'seconds' },
      current: {
        time: '2026-11-06T22:15',
        interval: 900,
        temperature_2m: 17.1,
      },
      hourly_units: { time: 'iso8601', temperature_2m: '°C' },
      hourly: { time: ['2026-11-06T00:00'], temperature_2m: [null] },
      minutely_15: { time: [1, 2], temperature_2m: [1.5, 2.5] },
      daily: { time: ['2026-11-06'], sunrise: ['2026-11-06T11:32'] },
      model_specific: { anything: true },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.hourly?.temperature_2m, [null]);
    asserts.assertEquals(value?.model_specific, { anything: true });
  });

  it('rejects a missing grid cell or a non-numeric coordinate', () => {
    const { latitude: _, ...noLat } = base;
    asserts.assertExists(OpenMeteoForecastSchemaObject.safeParse(noLat)[0]);
    asserts.assertExists(
      OpenMeteoForecastSchemaObject.safeParse({
        ...base,
        latitude: '40.78',
      })[0],
    );
  });

  it('rejects ragged or non-scalar series blocks', () => {
    asserts.assertExists(
      OpenMeteoSeriesBlockSchemaObject.safeParse({ time: [1, 2], a: [1] })[0],
    );
    asserts.assertExists(
      OpenMeteoSeriesBlockSchemaObject.safeParse({ time: [1], a: [[1]] })[0],
    );
    asserts.assertExists(
      OpenMeteoSeriesBlockSchemaObject.safeParse({ a: [1] })[0],
    );
    asserts.assertEquals(
      OpenMeteoSeriesBlockSchemaObject.safeParse({ time: [], a: [] })[0],
      null,
    );
  });

  it('reads the error body loosely', () => {
    const [, body] = OpenMeteoErrorBodySchemaObject.safeParse({
      error: true,
      reason: 'bad',
    });
    asserts.assertEquals(body?.reason, 'bad');
    asserts.assertEquals(
      OpenMeteoErrorBodySchemaObject.safeParse({})[0],
      null,
    );
  });
});
