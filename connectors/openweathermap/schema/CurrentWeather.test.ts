import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CurrentWeatherSchemaObject } from './CurrentWeather.ts';

const validCurrentWeather = {
  coord: { lon: -0.13, lat: 51.51 },
  weather: [
    { id: 800, main: 'Clear', description: 'clear sky', icon: '01d' },
  ],
  base: 'stations',
  main: {
    temp: 15.2,
    feels_like: 14.6,
    temp_min: 13.9,
    temp_max: 16.1,
    pressure: 1015,
    humidity: 72,
  },
  visibility: 10000,
  wind: { speed: 4.1, deg: 280 },
  clouds: { all: 0 },
  dt: 1700000000,
  sys: {
    type: 2,
    id: 2019646,
    country: 'GB',
    sunrise: 1699945200,
    sunset: 1699977600,
  },
  timezone: 0,
  id: 2643743,
  name: 'London',
  cod: 200,
};

describe('OpenWeatherMap.schema.CurrentWeather', () => {
  it('accepts a fully documented current weather response', () => {
    asserts.assertEquals(
      CurrentWeatherSchemaObject.safeParse(validCurrentWeather)[0],
      null,
    );
  });

  it('accepts a minimal response without optional fields', () => {
    const minimal = {
      ...validCurrentWeather,
      sys: { sunrise: 1699945200, sunset: 1699977600 },
    };
    asserts.assertEquals(
      CurrentWeatherSchemaObject.safeParse(minimal)[0],
      null,
    );
  });

  it('accepts rain and snow volumes when present', () => {
    const withPrecipitation = {
      ...validCurrentWeather,
      rain: { '1h': 0.5 },
      snow: { '1h': 1.2 },
    };
    asserts.assertEquals(
      CurrentWeatherSchemaObject.safeParse(withPrecipitation)[0],
      null,
    );
  });

  it('accepts a numeric-string cod for consistency with the forecast endpoint', () => {
    const stringCod = { ...validCurrentWeather, cod: '200' };
    asserts.assertEquals(
      CurrentWeatherSchemaObject.safeParse(stringCod)[0],
      null,
    );
  });

  it('rejects a response missing required fields', () => {
    const { coord: _coord, ...missingCoord } = validCurrentWeather;
    asserts.assertExists(
      CurrentWeatherSchemaObject.safeParse(missingCoord)[0],
    );
  });

  it('rejects an empty weather array', () => {
    const empty = { ...validCurrentWeather, weather: [] };
    asserts.assertExists(CurrentWeatherSchemaObject.safeParse(empty)[0]);
  });
});
