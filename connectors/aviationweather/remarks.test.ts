import * as asserts from '@asserts';
import { describe, it } from '@test';
import { parseRemarkTemperatures } from './remarks.ts';

describe('AviationWeather.parseRemarkTemperatures', () => {
  it('reads the T-group to a tenth of a degree', () => {
    const t = parseRemarkTemperatures(
      'METAR KNYC 062151Z AUTO 00000KT 10SM BKN047 OVC065 16/15 A2983 RMK AO2 RAE2058 SLP094 P0000 T01610150',
    );
    asserts.assertEquals(t, {
      hourly: { group: 'T01610150', temperatureC: 16.1, dewpointC: 15 },
    });
  });

  it('reads negative values and a T-group without dewpoint', () => {
    const t = parseRemarkTemperatures(
      'METAR KFAI 061753Z 00000KT 10SM CLR M12/M15 A3012 RMK AO2 T11221150 11089 21128 401001128',
    );
    asserts.assertEquals(t.hourly?.temperatureC, -12.2);
    asserts.assertEquals(t.hourly?.dewpointC, -15);
    asserts.assertEquals(t.sixHourMax, { group: '11089', temperatureC: -8.9 });
    asserts.assertEquals(t.sixHourMin, { group: '21128', temperatureC: -12.8 });
    asserts.assertEquals(t.twentyFourHour, {
      group: '401001128',
      maxC: 10,
      minC: -12.8,
    });
    asserts.assertEquals(
      parseRemarkTemperatures('METAR X 1Z RMK T0161').hourly,
      { group: 'T0161', temperatureC: 16.1, dewpointC: null },
    );
  });

  it('reads 6-hour extremes on a synoptic report', () => {
    const t = parseRemarkTemperatures(
      'METAR KNYC 061751Z AUTO 00000KT 3SM -RA BR FEW012 OVC060 19/18 A2985 RMK AO2 RAB43 SLP099 P0001 60021 T01890183 10200 20189 55011',
    );
    asserts.assertEquals(t.sixHourMax?.temperatureC, 20);
    asserts.assertEquals(t.sixHourMin?.temperatureC, 18.9);
  });

  it('ignores the body, missing digits and reports without remarks', () => {
    // `10161` before RMK is not a remark group.
    asserts.assertEquals(
      parseRemarkTemperatures('METAR KXYZ 061751Z 10161 19/18 A2985'),
      {},
    );
    asserts.assertEquals(
      parseRemarkTemperatures('METAR KXYZ 061751Z 19/18 RMK AO2 1//// T////'),
      {},
    );
    asserts.assertEquals(
      parseRemarkTemperatures('SPECI KXYZ 1Z RMK AO2 T01610150=').hourly
        ?.temperatureC,
      16.1,
    );
  });

  it('keeps the first occurrence of each group', () => {
    const t = parseRemarkTemperatures('METAR X 1Z RMK T01610150 T02000190');
    asserts.assertEquals(t.hourly?.group, 'T01610150');
  });
});
