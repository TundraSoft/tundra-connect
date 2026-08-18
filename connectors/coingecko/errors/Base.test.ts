import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CoinGeckoError } from './Base.ts';
import { CoinGeckoErrorCodes } from './CoinGeckoErrorCodes.ts';

describe('CoinGecko.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new CoinGeckoError('NOT_FOUND', { status: 404 });
    asserts.assertStringIncludes(error.message, 'not found');
    asserts.assertEquals(error.getContextValue('vendor'), 'CoinGecko');
    asserts.assertEquals(error.code, 'NOT_FOUND');
  });

  it('interpolates contextual error metadata', () => {
    const error = new CoinGeckoError('RATE_LIMITED', { status: 429 });
    asserts.assertStringIncludes(error.message, '429');
  });

  it('carries the original vendor error_code as diagnostic metadata', () => {
    const error = new CoinGeckoError('MISSING_API_KEY', {
      status: 401,
      vendorErrorCode: 10002,
    });
    asserts.assertEquals(error.getContextValue('vendorErrorCode'), 10002);
  });

  it('falls back to the unknown error code', () => {
    const error = new CoinGeckoError('INVALID_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      'An unknown error occurred while communicating with CoinGecko.',
    );
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertEquals(error.getContextValue('originalCode'), 'INVALID_CODE');
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('falls back to the unknown error code with arbitrary meta and a clean message', () => {
    // The fallback remaps any unregistered code to UNKNOWN_ERROR with
    // whatever meta the throw site supplied — the rendered message must
    // stay the static UNKNOWN_ERROR text, with no literal placeholder.
    const error = new CoinGeckoError('NOT_A_CODE' as never, {
      status: 502,
      anything: 'goes',
    });
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
    asserts.assertEquals(error.getContextValue('originalCode'), 'NOT_A_CODE');
    asserts.assertEquals(error.getContextValue('status'), 502);
    asserts.assertStringIncludes(
      error.message,
      'An unknown error occurred while communicating with CoinGecko.',
    );
    asserts.assertEquals(error.message.includes('${'), false);
  });

  it('fills unsupplied template placeholders with a neutral marker', () => {
    // CONFIG_INVALID_ENVIRONMENT's template interpolates ${environment};
    // constructing it without that context value must render the tripwire's
    // filler, never a literal '${environment}'.
    const error = new CoinGeckoError('CONFIG_INVALID_ENVIRONMENT');
    asserts.assertStringIncludes(error.message, '<environment unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);

    // Same for a status-interpolating vendor code thrown without a status.
    const rateLimited = new CoinGeckoError('RATE_LIMITED');
    asserts.assertStringIncludes(rateLimited.message, '<status unavailable>');
    asserts.assertEquals(rateLimited.message.includes('${'), false);
  });

  it('exposes every documented error code as a template', () => {
    for (const code of Object.keys(CoinGeckoErrorCodes)) {
      asserts.assertEquals(
        typeof CoinGeckoErrorCodes[
          code as keyof typeof CoinGeckoErrorCodes
        ],
        'string',
      );
    }
  });
});
