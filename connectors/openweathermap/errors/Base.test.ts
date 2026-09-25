import * as asserts from '@asserts';
import { describe, it } from '@test';
import { OpenWeatherMapError, OpenWeatherMapErrorCodes } from './mod.ts';

describe('OpenWeatherMap.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new OpenWeatherMapError('INVALID_API_KEY', { status: 401 });
    asserts.assertStringIncludes(
      error.message,
      'OpenWeatherMap rejected the configured API key (HTTP 401)',
    );
    asserts.assertEquals(error.getContextValue('vendor'), 'OpenWeatherMap');
    asserts.assertEquals(error.getContextValue('status'), 401);
    asserts.assertEquals(error.code, 'INVALID_API_KEY');
  });

  it('interpolates contextual error metadata', () => {
    const error = new OpenWeatherMapError('RATE_LIMITED', { status: 429 });
    asserts.assertStringIncludes(error.message, 'HTTP 429');
  });

  it('falls back to the unknown error code', () => {
    const error = new OpenWeatherMapError('INVALID_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      OpenWeatherMapErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(error.getContextValue('originalCode'), 'INVALID_CODE');
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new OpenWeatherMapError('RATE_LIMITED');
    asserts.assertStringIncludes(error.message, '<status unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });
});
