import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CloudsSchemaObject,
  codGuard,
  CoordSchemaObject,
  WeatherConditionSchemaObject,
  WindSchemaObject,
} from './Common.ts';

describe('OpenWeatherMap.schema.Common', () => {
  it('validates cod as either a number or a numeric string', () => {
    asserts.assertEquals(codGuard.safeParse(200)[0], null);
    asserts.assertEquals(codGuard.safeParse('200')[0], null);
  });

  it('preserves a numeric string as a string, rather than coercing it to a number', () => {
    // Regression test: codGuard used to be built on
    // `Guardian.oneOf([Guardian.number(), Guardian.string()], ...)`.
    // `Guardian.number()` coerces numeric strings by default, and `oneOf`
    // tries its guards in order, so the forecast endpoint's string `"200"`
    // always resolved through the number branch first — silently returning
    // a `number` even though a `string` was passed in. The number branch
    // now uses `.strict()` to block that coercion, so the original type
    // must survive here.
    const [error, value] = codGuard.safeParse('200');
    asserts.assertEquals(error, null);
    asserts.assertEquals(value, '200');
    asserts.assertEquals(typeof value, 'string');
  });

  it('rejects a non-number/non-string cod', () => {
    asserts.assertExists(codGuard.safeParse(true)[0]);
    asserts.assertExists(codGuard.safeParse(null)[0]);
  });

  it('validates documented coordinate pairs', () => {
    asserts.assertEquals(
      CoordSchemaObject.safeParse({ lon: -0.13, lat: 51.51 })[0],
      null,
    );
  });

  it('rejects malformed coordinate pairs', () => {
    asserts.assertExists(
      CoordSchemaObject.safeParse({ lon: 'x', lat: 51.51 })[0],
    );
  });

  it('validates a documented weather condition entry', () => {
    asserts.assertEquals(
      WeatherConditionSchemaObject.safeParse({
        id: 800,
        main: 'Clear',
        description: 'clear sky',
        icon: '01d',
      })[0],
      null,
    );
  });

  it('rejects an incomplete weather condition entry', () => {
    asserts.assertExists(
      WeatherConditionSchemaObject.safeParse({ id: 800, main: 'Clear' })[0],
    );
  });

  it('validates cloudiness within 0-100', () => {
    asserts.assertEquals(CloudsSchemaObject.safeParse({ all: 20 })[0], null);
    asserts.assertExists(CloudsSchemaObject.safeParse({ all: 101 })[0]);
  });

  it('validates wind data with an optional gust', () => {
    asserts.assertEquals(
      WindSchemaObject.safeParse({ speed: 4.1, deg: 280 })[0],
      null,
    );
    asserts.assertEquals(
      WindSchemaObject.safeParse({ speed: 4.1, deg: 280, gust: 6.7 })[0],
      null,
    );
    asserts.assertExists(
      WindSchemaObject.safeParse({ speed: -1, deg: 280 })[0],
    );
  });
});
