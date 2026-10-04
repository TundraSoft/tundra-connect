import * as asserts from '@asserts';
import { describe, it } from '@test';
import { PolymarketError } from './Base.ts';
import {
  POLYMARKET_TRANSIENT_CODES,
  PolymarketErrorCodes,
} from './PolymarketErrorCodes.ts';

describe('Polymarket.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new PolymarketError('SERVICE_UNAVAILABLE', { status: 503 });
    asserts.assertStringIncludes(error.message, 'unavailable');
    asserts.assertEquals(error.getContextValue('vendor'), 'Polymarket');
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new PolymarketError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      PolymarketErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new PolymarketError('INVALID_REQUEST', { status: 400 });
    asserts.assertEquals(error.code, 'INVALID_REQUEST');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new PolymarketError('RESPONSE_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new PolymarketError('INVALID_REQUEST');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<status unavailable>');
  });

  it('flags exactly the transient codes', () => {
    for (const code of Object.keys(PolymarketErrorCodes)) {
      const error = new PolymarketError(code as never);
      asserts.assertEquals(
        error.transient,
        POLYMARKET_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...POLYMARKET_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });
});
