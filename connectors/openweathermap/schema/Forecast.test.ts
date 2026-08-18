import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ForecastListItemSchemaObject,
  ForecastSchemaObject,
} from './Forecast.ts';

const validForecastEntry = {
  dt: 1700010800,
  main: {
    temp: 14.1,
    feels_like: 13.4,
    temp_min: 13.2,
    temp_max: 14.1,
    pressure: 1014,
    sea_level: 1014,
    grnd_level: 1009,
    humidity: 75,
    temp_kf: 0.9,
  },
  weather: [
    { id: 800, main: 'Clear', description: 'clear sky', icon: '01n' },
  ],
  clouds: { all: 5 },
  wind: { speed: 3.2, deg: 260 },
  visibility: 10000,
  pop: 0.1,
  sys: { pod: 'n' },
  dt_txt: '2023-11-14 21:00:00',
};

const validForecast = {
  cod: '200',
  message: 0,
  cnt: 1,
  list: [validForecastEntry],
  city: {
    id: 2643743,
    name: 'London',
    coord: { lat: 51.51, lon: -0.13 },
    country: 'GB',
    population: 1000000,
    timezone: 0,
    sunrise: 1699945200,
    sunset: 1699977600,
  },
};

describe('OpenWeatherMap.schema.Forecast', () => {
  it('accepts a documented forecast entry', () => {
    asserts.assertEquals(
      ForecastListItemSchemaObject.safeParse(validForecastEntry)[0],
      null,
    );
  });

  it('accepts a forecast entry with rain/snow volumes', () => {
    const withPrecipitation = {
      ...validForecastEntry,
      rain: { '3h': 0.5 },
      snow: { '3h': 1.1 },
    };
    asserts.assertEquals(
      ForecastListItemSchemaObject.safeParse(withPrecipitation)[0],
      null,
    );
  });

  it('rejects an entry with an invalid part-of-day flag', () => {
    const invalid = { ...validForecastEntry, sys: { pod: 'x' } };
    asserts.assertExists(ForecastListItemSchemaObject.safeParse(invalid)[0]);
  });

  it('accepts a fully documented forecast response with a string cod', () => {
    asserts.assertEquals(
      ForecastSchemaObject.safeParse(validForecast)[0],
      null,
    );
  });

  it('also accepts a numeric cod for forward compatibility', () => {
    const numericCod = { ...validForecast, cod: 200 };
    asserts.assertEquals(ForecastSchemaObject.safeParse(numericCod)[0], null);
  });

  it('rejects a response missing required city metadata', () => {
    const { city: _city, ...missingCity } = validForecast;
    asserts.assertExists(ForecastSchemaObject.safeParse(missingCity)[0]);
  });
});
