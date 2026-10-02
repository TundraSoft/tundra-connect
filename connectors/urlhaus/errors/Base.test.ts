import * as asserts from '@asserts';
import { describe, it } from '@test';
import { URLhausError } from './Base.ts';
import {
  URLHAUS_TRANSIENT_CODES,
  URLhausErrorCodes,
} from './URLhausErrorCodes.ts';

describe('URLhaus.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new URLhausError('SERVICE_UNAVAILABLE', { status: 503 });
    asserts.assertStringIncludes(error.message, 'unavailable');
    asserts.assertEquals(error.getContextValue('vendor'), 'URLhaus');
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new URLhausError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      URLhausErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new URLhausError('INVALID_REQUEST', { status: 400 });
    asserts.assertEquals(error.code, 'INVALID_REQUEST');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new URLhausError('RESPONSE_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new URLhausError('INVALID_REQUEST');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<status unavailable>');
  });

  it('flags the no-verdict-yet codes as transient, and nothing else', () => {
    for (const code of Object.keys(URLhausErrorCodes)) {
      const error = new URLhausError(code as keyof typeof URLhausErrorCodes);
      asserts.assertEquals(
        error.transient,
        URLHAUS_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...URLHAUS_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });
});
