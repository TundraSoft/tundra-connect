import * as asserts from '@asserts';
import { describe, it } from '@test';
import { OpenExchangeError, OpenExchangeErrorCodes } from './mod.ts';

describe('OpenExchange.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new OpenExchangeError('MISSING_APP_ID');
    asserts.assertStringIncludes(
      error.message,
      OpenExchangeErrorCodes.MISSING_APP_ID,
    );
    asserts.assertEquals(error.getContextValue('vendor'), 'OpenExchange');
    asserts.assertEquals(error.code, 'MISSING_APP_ID');
  });

  it('interpolates contextual error metadata', () => {
    const error = new OpenExchangeError('CONFIG_INVALID_BASE_CURRENCY', {
      baseCurrency: 'XYZ',
    });
    asserts.assertStringIncludes(error.message, 'got XYZ');
  });

  it('falls back to the unknown error code', () => {
    const error = new OpenExchangeError('INVALID_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      OpenExchangeErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(error.getContextValue('originalCode'), 'INVALID_CODE');
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new OpenExchangeError('CONFIG_INVALID_BASE_CURRENCY');
    asserts.assertStringIncludes(error.message, '<baseCurrency unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });
});
