import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  EIADataResponseSchemaObject,
  EIAErrorBodySchemaObject,
  EIARouteSchemaObject,
  EIARowSchemaObject,
} from './mod.ts';

describe('EIA.schema', () => {
  it('accepts rows with hyphenated keys and string/number/null values', () => {
    asserts.assertEquals(
      EIARowSchemaObject.safeParse({
        period: '2026-11-03',
        'series-description': 'x',
        value: '107.03',
        other: 1,
        missing: null,
      })[0],
      null,
    );
    asserts.assertExists(EIARowSchemaObject.safeParse({ value: '1' })[0]);
    asserts.assertExists(
      EIARowSchemaObject.safeParse({ period: '2026', value: { x: 1 } })[0],
    );
  });

  it('accepts a data page with a string total and keeps extra fields', () => {
    const [error, page] = EIADataResponseSchemaObject.safeParse({
      response: {
        total: '2301',
        data: [{ period: '2026-10-30', value: '409760' }],
      },
      request: { command: '/v2/petroleum/stoc/wstk/data/', params: {} },
      apiVersion: '2.1.14',
      ExcelAddInVersion: '2.1.0',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.response.total, '2301');
    asserts.assertEquals(page?.ExcelAddInVersion, '2.1.0');
    asserts.assertExists(
      EIADataResponseSchemaObject.safeParse({ response: { data: [] } })[0],
    );
  });

  it('accepts branch and data route metadata', () => {
    const base = {
      request: { command: '/v2/petroleum/', params: [] },
      apiVersion: '2.1.14',
    };
    asserts.assertEquals(
      EIARouteSchemaObject.safeParse({
        ...base,
        response: { id: 'petroleum', routes: [{ id: 'pri', name: 'Prices' }] },
      })[0],
      null,
    );
    asserts.assertEquals(
      EIARouteSchemaObject.safeParse({
        ...base,
        response: {
          id: 'petroleum',
          frequency: [{ id: 'weekly', query: 'W', format: 'YYYY-MM-DD' }],
          facets: [{ id: 'series', description: 'Series' }],
          data: { value: [] },
          startPeriod: '1982-08-20',
          endPeriod: '2026-10-30',
        },
      })[0],
      null,
    );
  });

  it('reads both error shapes', () => {
    const [, gateway] = EIAErrorBodySchemaObject.safeParse({
      error: { code: 'API_KEY_MISSING', message: 'No api_key' },
    });
    asserts.assertEquals(
      (gateway?.error as { code: string }).code,
      'API_KEY_MISSING',
    );
    const [, api] = EIAErrorBodySchemaObject.safeParse({
      error: 'Not found.',
      code: 404,
    });
    asserts.assertEquals(api?.error, 'Not found.');
  });
});
