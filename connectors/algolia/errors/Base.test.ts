import * as asserts from '@asserts';
import { describe, it } from '@test';
import { AlgoliaError } from './Base.ts';
import {
  ALGOLIA_TRANSIENT_CODES,
  AlgoliaErrorCodes,
} from './AlgoliaErrorCodes.ts';

describe('Algolia.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new AlgoliaError('SERVICE_UNAVAILABLE', { status: 503 });
    asserts.assertStringIncludes(error.message, 'unavailable');
    asserts.assertEquals(error.getContextValue('vendor'), 'Algolia');
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new AlgoliaError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      AlgoliaErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new AlgoliaError('INVALID_REQUEST', { status: 400 });
    asserts.assertEquals(error.code, 'INVALID_REQUEST');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new AlgoliaError('RESPONSE_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new AlgoliaError('INVALID_REQUEST');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<status unavailable>');
  });

  it('flags exactly the transient codes', () => {
    for (const code of Object.keys(AlgoliaErrorCodes)) {
      const error = new AlgoliaError(code as never);
      asserts.assertEquals(
        error.transient,
        ALGOLIA_TRANSIENT_CODES.has(error.code),
        code,
      );
    }
    asserts.assertEquals(
      [...ALGOLIA_TRANSIENT_CODES].sort(),
      ['NETWORK_ERROR', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    );
  });
});
