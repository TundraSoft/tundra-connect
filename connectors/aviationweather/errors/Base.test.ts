import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  AVIATIONWEATHER_TRANSIENT_CODES,
  AviationWeatherError,
  AviationWeatherErrorCodes,
} from './mod.ts';

describe('AviationWeather.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new AviationWeatherError('FORBIDDEN', { status: 403 });
    asserts.assertStringIncludes(
      error.message,
      'aviationweather.gov refused the request (HTTP 403)',
    );
    asserts.assertEquals(error.getContextValue('vendor'), 'AviationWeather');
    asserts.assertEquals(error.getContextValue('status'), 403);
    asserts.assertEquals(error.code, 'FORBIDDEN');
  });

  it('interpolates contextual error metadata', () => {
    const error = new AviationWeatherError('RATE_LIMITED', { status: 429 });
    asserts.assertStringIncludes(error.message, 'HTTP 429');
  });

  it('falls back to the unknown error code', () => {
    const error = new AviationWeatherError('INVALID_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      AviationWeatherErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(error.getContextValue('originalCode'), 'INVALID_CODE');
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new AviationWeatherError('RATE_LIMITED');
    asserts.assertStringIncludes(error.message, '<status unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });

  it('flags exactly the transient codes', () => {
    for (const code of Object.keys(AviationWeatherErrorCodes)) {
      const error = new AviationWeatherError(code as never);
      asserts.assertEquals(
        error.transient,
        AVIATIONWEATHER_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...AVIATIONWEATHER_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });
});
