import * as asserts from '@asserts';
import { describe, it } from '@test';
import { UpstashRedisError } from './Base.ts';
import { UpstashRedisErrorCodes } from './UpstashRedisErrorCodes.ts';

describe('UpstashRedis.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new UpstashRedisError('SERVICE_UNAVAILABLE', { status: 503 });
    asserts.assertStringIncludes(error.message, 'unavailable');
    asserts.assertEquals(error.getContextValue('vendor'), 'UpstashRedis');
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new UpstashRedisError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      UpstashRedisErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new UpstashRedisError('INVALID_REQUEST', {
      reason: 'ex and px are mutually exclusive',
    });
    asserts.assertEquals(error.code, 'INVALID_REQUEST');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new UpstashRedisError('RESPONSE_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new UpstashRedisError('INVALID_REQUEST');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<reason unavailable>');
  });
});
