import * as asserts from '@asserts';
import { describe, it } from '@test';
import { columns } from './series.ts';

describe('OpenMeteo.columns', () => {
  it('splits ensemble columns into member and model, control as 0', () => {
    const block = {
      time: [1, 2],
      temperature_2m_ncep_gefs_seamless: [1, 2],
      temperature_2m_member01_ncep_gefs_seamless: [3, 4],
      temperature_2m_member30_ncep_gefs_seamless: [5, null],
      temperature_2m_ecmwf_ifs025_ensemble: [6, 7],
      temperature_2m_member50_ecmwf_ifs025_ensemble: [8, 9],
    };
    const out = columns(block, ['temperature_2m']).map((c) => [
      c.member,
      c.model,
      c.values,
    ]);
    asserts.assertEquals(out, [
      [0, 'ncep_gefs_seamless', [1, 2]],
      [1, 'ncep_gefs_seamless', [3, 4]],
      [30, 'ncep_gefs_seamless', [5, null]],
      [0, 'ecmwf_ifs025_ensemble', [6, 7]],
      [50, 'ecmwf_ifs025_ensemble', [8, 9]],
    ]);
  });

  it('matches the longest requested variable first', () => {
    const block = {
      time: ['2025-01-01'],
      temperature_2m: [1],
      temperature_2m_max: [2],
      temperature_2m_previous_day1_gfs_seamless: [3],
      unrelated: [4],
    };
    const out = columns(block, [
      'temperature_2m',
      'temperature_2m_max',
      'temperature_2m_previous_day1',
    ]).map((c) => [c.key, c.variable, c.member, c.model]);
    asserts.assertEquals(out, [
      ['temperature_2m', 'temperature_2m', null, null],
      ['temperature_2m_max', 'temperature_2m_max', null, null],
      [
        'temperature_2m_previous_day1_gfs_seamless',
        'temperature_2m_previous_day1',
        null,
        'gfs_seamless',
      ],
    ]);
  });

  it('leaves a single-model column without member or model', () => {
    const [only] = columns({ time: [1], dew_point_2m: [2] }, [
      'dew_point_2m',
    ]);
    asserts.assertEquals(only?.member, null);
    asserts.assertEquals(only?.model, null);
  });
});
