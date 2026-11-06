import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  AviationWeatherErrorBodySchemaObject,
  AviationWeatherMetarSchemaObject,
  AviationWeatherTafSchemaObject,
} from './mod.ts';

const metar = {
  icaoId: 'KLGA',
  receiptTime: '2026-11-06T20:54:07.393Z',
  obsTime: 1793998260,
  reportTime: '2026-11-06T21:00:00.000Z',
  temp: 18.9,
  dewp: 13.9,
  wdir: 'VRB',
  wspd: 4,
  visib: '10+',
  altim: 1008.9,
  slp: 1008.7,
  qcField: 4,
  wxString: '-RA',
  metarType: 'METAR',
  rawOb: 'METAR KLGA 062051Z VRB04KT 8SM -RA 19/14 A2979 RMK AO2 T01890139',
  clouds: [{ cover: 'FEW', base: 1000 }],
  fltCat: 'VFR',
  newField: 'kept',
};

describe('AviationWeather.schema', () => {
  it('accepts a decoded METAR, string-valued wdir/visib and unknown fields', () => {
    const [error, value] = AviationWeatherMetarSchemaObject.safeParse(metar);
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.wdir, 'VRB');
    asserts.assertEquals(value?.visib, '10+');
    asserts.assertEquals(value?.newField, 'kept');
  });

  it('rejects a METAR without raw text or with a coerced number', () => {
    const { rawOb: _, ...noRaw } = metar;
    asserts.assertExists(AviationWeatherMetarSchemaObject.safeParse(noRaw)[0]);
    asserts.assertExists(
      AviationWeatherMetarSchemaObject.safeParse({ ...metar, temp: '18.9' })[0],
    );
    asserts.assertExists(
      AviationWeatherMetarSchemaObject.safeParse({ ...metar, wdir: {} })[0],
    );
  });

  it('accepts a TAF with null period fields', () => {
    const [error, taf] = AviationWeatherTafSchemaObject.safeParse({
      icaoId: 'KLGA',
      issueTime: '2026-11-06T20:30:00.000Z',
      validTimeFrom: 1793998800,
      validTimeTo: 1794096000,
      rawTAF: 'TAF KLGA 062030Z 0621/0724 32007KT P6SM',
      fcsts: [{
        timeFrom: 1793998800,
        timeTo: 1794009600,
        timeBec: null,
        fcstChange: null,
        probability: null,
        wdir: 320,
        clouds: [],
        temp: [],
      }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(taf?.fcsts[0]?.wdir, 320);
    asserts.assertExists(
      AviationWeatherTafSchemaObject.safeParse({ icaoId: 'KLGA' })[0],
    );
  });

  it('reads the error body', () => {
    const [, body] = AviationWeatherErrorBodySchemaObject.safeParse({
      status: 'error',
      error: 'Invalid value for hours',
    });
    asserts.assertEquals(body?.error, 'Invalid value for hours');
  });
});
