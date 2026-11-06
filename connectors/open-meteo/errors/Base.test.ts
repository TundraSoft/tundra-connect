import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  OPENMETEO_TRANSIENT_CODES,
  OpenMeteoError,
  OpenMeteoErrorCodes,
} from './mod.ts';

describe('OpenMeteo.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new OpenMeteoError('INVALID_API_KEY', { status: 401 });
    asserts.assertStringIncludes(
      error.message,
      'Open-Meteo rejected the configured API key (HTTP 401)',
    );
    asserts.assertEquals(error.getContextValue('vendor'), 'OpenMeteo');
    asserts.assertEquals(error.getContextValue('status'), 401);
    asserts.assertEquals(error.code, 'INVALID_API_KEY');
  });

  it('interpolates contextual error metadata', () => {
    const error = new OpenMeteoError('RATE_LIMITED', { status: 429 });
    asserts.assertStringIncludes(error.message, 'HTTP 429');
  });

  it('falls back to the unknown error code', () => {
    const error = new OpenMeteoError('INVALID_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      OpenMeteoErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(error.getContextValue('originalCode'), 'INVALID_CODE');
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new OpenMeteoError('RATE_LIMITED');
    asserts.assertStringIncludes(error.message, '<status unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });

  it('flags exactly the transient codes', () => {
    for (const code of Object.keys(OpenMeteoErrorCodes)) {
      const error = new OpenMeteoError(code as never);
      asserts.assertEquals(
        error.transient,
        OPENMETEO_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...OPENMETEO_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });
});
